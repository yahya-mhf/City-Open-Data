import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from prophet import Prophet
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from ..core.dependencies import get_db, redis_manager

router = APIRouter()

FORECAST_CACHE_TTL = 3600
FORECAST_CACHE_PREFIX = "forecast:{}:{}"

MAX_HOURS = 72
DEFAULT_HOURS = 24
TRAINING_DAYS = 7
MIN_TRAINING_POINTS = 4


def _build_forecast_key(metric_key: str, sensor_id: str) -> str:
    return FORECAST_CACHE_PREFIX.format(metric_key, sensor_id)


def _run_prophet(
    timestamps: list[datetime],
    values: list[float],
    periods: int,
) -> list[dict[str, Any]]:
    df = pd.DataFrame({"ds": pd.to_datetime(timestamps), "y": values})
    model = Prophet(
        changepoint_prior_scale=0.05,
        seasonality_mode="additive",
        weekly_seasonality=True,
        daily_seasonality=False,
    )
    model.fit(df)
    future = model.make_future_dataframe(periods=periods, freq="h", include_history=False)
    forecast = model.predict(future)
    last = forecast.tail(periods)
    return [
        {
            "time": row["ds"].isoformat(),
            "value": round(float(row["yhat"]), 2),
            "lower_bound": round(float(row["yhat_lower"]), 2),
            "upper_bound": round(float(row["yhat_upper"]), 2),
        }
        for _, row in last.iterrows()
    ]


async def _get_cached_forecast(metric_key: str, sensor_id: str) -> list[dict[str, Any]] | None:
    client = redis_manager.client
    if not client:
        return None
    key = _build_forecast_key(metric_key, sensor_id)
    raw = await client.get(key)
    if raw:
        return json.loads(raw)
    return None


async def _set_cached_forecast(metric_key: str, sensor_id: str, data: list[dict[str, Any]]) -> None:
    client = redis_manager.client
    if not client:
        return
    key = _build_forecast_key(metric_key, sensor_id)
    await client.set(key, json.dumps(data, default=str), ex=FORECAST_CACHE_TTL)


async def _forecast_sensor(
    metric_key: str,
    metric_id,
    sensor_id: str,
    hours_ahead: int,
    db: AsyncSession,
    loop: asyncio.AbstractEventLoop,
) -> dict[str, Any] | None:
    cached = await _get_cached_forecast(metric_key, sensor_id)
    if cached is not None:
        return {"sensor_id": sensor_id, "forecast": cached}

    since = datetime.now(timezone.utc) - timedelta(days=TRAINING_DAYS)
    query = text("""
        SELECT bucket, avg_value
        FROM sensor_readings_hourly
        WHERE metric_id = :metric_id
          AND sensor_id = :sensor_id
          AND bucket >= :since
        ORDER BY bucket ASC
    """)
    rows = (await db.execute(query, {"metric_id": metric_id, "sensor_id": sensor_id, "since": since})).all()

    if len(rows) < MIN_TRAINING_POINTS:
        return None

    timestamps = [r.bucket for r in rows]
    values = [float(r.avg_value) for r in rows]

    try:
        forecast = await loop.run_in_executor(
            None, _run_prophet, timestamps, values, hours_ahead
        )
    except Exception:
        return None

    await _set_cached_forecast(metric_key, sensor_id, forecast)
    return {"sensor_id": sensor_id, "forecast": forecast}


@router.get("/layers/{metric_key}/forecast")
async def get_forecast(
    metric_key: str,
    sensor_id: str | None = Query(None),
    hours_ahead: int = Query(DEFAULT_HOURS, ge=1, le=MAX_HOURS),
    db: AsyncSession = Depends(get_db),
):
    metric_result = await db.execute(
        select(models.MetricDefinition).where(models.MetricDefinition.key == metric_key)
    )
    metric = metric_result.scalar_one_or_none()
    if not metric:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Metric '{metric_key}' not found",
        )
    metric_id = metric.id

    loop = asyncio.get_event_loop()

    if sensor_id:
        result = await _forecast_sensor(metric_key, metric_id, sensor_id, hours_ahead, db, loop)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Insufficient data to forecast sensor '{sensor_id}' for metric '{metric_key}'",
            )
        return result

    sensors_result = await db.execute(
        select(models.Sensor).where(models.Sensor.status == "active")
    )
    all_sensors = sensors_result.scalars().all()

    tasks = [
        _forecast_sensor(metric_key, metric_id, s.id, hours_ahead, db, loop)
        for s in all_sensors
    ]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]
