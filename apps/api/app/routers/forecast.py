import asyncio
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from prophet import Prophet
from sqlalchemy import select, text, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from ..core.dependencies import get_db, redis_manager

router = APIRouter()

FORECAST_CACHE_TTL = 3600
FORECAST_CACHE_PREFIX = "forecast:{}:{}:{}"

MAX_HOURS = 72
DEFAULT_HOURS = 24
TRAINING_DAYS = 14
MIN_TRAINING_POINTS = 4
MAX_REGRESSORS = 3


def _pearson(x: list[float], y: list[float]) -> float:
    n = min(len(x), len(y))
    if n < 3:
        return 0.0
    x, y = x[:n], y[:n]
    sx = sum(x)
    sy = sum(y)
    sxy = sum(a * b for a, b in zip(x, y))
    sx2 = sum(a * a for a in x)
    sy2 = sum(b * b for b in y)
    num = n * sxy - sx * sy
    den = ((n * sx2 - sx * sx) * (n * sy2 - sy * sy)) ** 0.5
    if den == 0:
        return 0.0
    r = num / den
    return max(-1.0, min(1.0, r))


def _build_forecast_key(metric_key: str, sensor_id: str, hours_ahead: int) -> str:
    return FORECAST_CACHE_PREFIX.format(metric_key, sensor_id, hours_ahead)


def _run_prophet(
    timestamps: list[datetime],
    values: list[float],
    periods: int,
    extra_regressors: dict[str, list[float]] | None = None,
) -> dict[str, Any]:
    df = pd.DataFrame({"ds": pd.to_datetime(timestamps), "y": values})

    ds_series = pd.to_datetime(timestamps)
    df["hour"] = ds_series.dt.hour.astype(float)
    df["weekend"] = (ds_series.dt.dayofweek >= 5).astype(float)

    model = Prophet(
        changepoint_prior_scale=0.05,
        seasonality_mode="additive",
        weekly_seasonality=True,
        daily_seasonality=False,
    )

    model.add_regressor("hour")
    model.add_regressor("weekend")

    regressor_names: list[str] = ["hour", "weekend"]
    if extra_regressors:
        for name, vals in extra_regressors.items():
            if len(vals) == len(df):
                df[name] = vals
                model.add_regressor(name)
                regressor_names.append(name)

    model.fit(df)

    future_dates = pd.date_range(
        start=df["ds"].iloc[-1] + pd.Timedelta(hours=1),
        periods=periods,
        freq="h",
    )
    future = pd.DataFrame({"ds": future_dates})
    future["hour"] = future["ds"].dt.hour.astype(float)
    future["weekend"] = (future["ds"].dt.dayofweek >= 5).astype(float)

    if extra_regressors:
        for name in extra_regressors:
            if name in df.columns:
                future[name] = df[name].mean()

    forecast = model.predict(future)
    last = forecast.tail(periods)

    regressor_importance: dict[str, float] = {}
    try:
        contribs = model.predict_seasonal_components(future)
        for name in regressor_names:
            if name in contribs.columns:
                regressor_importance[name] = round(float(contribs[name].abs().mean()), 4)
    except Exception:
        pass

    forecast_points = [
        {
            "time": row["ds"].isoformat(),
            "value": round(float(row["yhat"]), 2),
            "lower_bound": round(float(row["yhat_lower"]), 2),
            "upper_bound": round(float(row["yhat_upper"]), 2),
        }
        for _, row in last.iterrows()
    ]

    return {
        "forecast": forecast_points,
        "regressors": regressor_names,
        "regressor_importance": regressor_importance,
        "type": "multi-sensor" if (extra_regressors and len(extra_regressors) > 0) else "single-sensor",
    }


async def _get_cached_forecast(metric_key: str, sensor_id: str, hours_ahead: int) -> dict[str, Any] | None:
    client = redis_manager.client
    if not client:
        return None
    key = _build_forecast_key(metric_key, sensor_id, hours_ahead)
    raw = await client.get(key)
    if raw:
        return json.loads(raw)
    return None


async def _set_cached_forecast(metric_key: str, sensor_id: str, hours_ahead: int, data: dict[str, Any]) -> None:
    client = redis_manager.client
    if not client:
        return
    key = _build_forecast_key(metric_key, sensor_id, hours_ahead)
    await client.set(key, json.dumps(data, default=str), ex=FORECAST_CACHE_TTL)


async def _forecast_sensor(
    metric_key: str,
    metric_id,
    sensor_id: str,
    hours_ahead: int,
    db: AsyncSession,
    loop: asyncio.AbstractEventLoop,
) -> dict[str, Any] | None:
    cached = await _get_cached_forecast(metric_key, sensor_id, hours_ahead)
    if cached is not None:
        return {"sensor_id": sensor_id, **cached}

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

    other_metrics = await db.execute(
        select(models.MetricDefinition).where(
            models.MetricDefinition.is_active == True,
            models.MetricDefinition.id != metric_id,
        )
    )
    candidates = other_metrics.scalars().all()

    extra_regressors: dict[str, list[float]] = {}
    correlations: list[tuple[str, float]] = []

    for cm in candidates:
        cm_rows = await db.execute(
            text("""
                SELECT bucket, avg_value
                FROM sensor_readings_hourly
                WHERE metric_id = :metric_id
                  AND sensor_id = :sensor_id
                  AND bucket >= :since
                ORDER BY bucket ASC
            """),
            {"metric_id": cm.id, "sensor_id": sensor_id, "since": since},
        )
        cm_data = cm_rows.all()
        if len(cm_data) < MIN_TRAINING_POINTS:
            continue
        a_vals = values.copy()
        b_vals = [float(r.avg_value) for r in cm_data]
        corr = _pearson(a_vals, b_vals)
        if abs(corr) > 0.3:
            correlations.append((cm.key, corr))

    correlations.sort(key=lambda x: abs(x[1]), reverse=True)
    for name, _ in correlations[:MAX_REGRESSORS]:
        reg_rows = await db.execute(
            text("""
                SELECT bucket, avg_value
                FROM sensor_readings_hourly
                WHERE metric_id = (SELECT id FROM metric_definitions WHERE key = :key)
                  AND sensor_id = :sensor_id
                  AND bucket >= :since
                ORDER BY bucket ASC
            """),
            {"key": name, "sensor_id": sensor_id, "since": since},
        )
        reg_data = reg_rows.all()
        if len(reg_data) >= MIN_TRAINING_POINTS:
            extra_regressors[name] = [float(r.avg_value) for r in reg_data[:len(rows)]]

    try:
        result = await loop.run_in_executor(
            None, _run_prophet, timestamps, values, hours_ahead, extra_regressors if extra_regressors else None
        )
        if result is None:
            return None
    except Exception:
        return None

    cache_data = {k: result[k] for k in ("forecast", "regressors", "regressor_importance", "type")}
    await _set_cached_forecast(metric_key, sensor_id, hours_ahead, cache_data)
    return {"sensor_id": sensor_id, **cache_data}


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
