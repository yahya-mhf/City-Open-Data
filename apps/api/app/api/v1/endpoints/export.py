import csv
import io
import json
import time
from collections import defaultdict
from datetime import datetime, timezone, date
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, func as sa_func, text, case
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.enums import SubscriptionPlan
from smart_city_shared.schemas import ExportRow

from ....core.dependencies import get_db, resolve_api_key_or_user
from ....core.redis_client import redis_manager

router = APIRouter()

RATE_LIMIT_WINDOW = 3600
RATE_LIMIT_MAX = 10
_DAILY_EXPORT_LIMITS: dict[str, int] = {
    SubscriptionPlan.FREE: 1000,
    SubscriptionPlan.PRO: 100000,
    SubscriptionPlan.ENTERPRISE: 999999999,
}
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_daily_export_store: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))


async def _check_rate_limit(user_id: str) -> None:
    if redis_manager.client:
        key = f"export:rate:{user_id}"
        count = await redis_manager.client.incr(key)
        if count == 1:
            await redis_manager.client.expire(key, RATE_LIMIT_WINDOW)
        if count > RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Max {RATE_LIMIT_MAX} exports per hour.",
            )
        return

    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    timestamps = _rate_limit_store[user_id]
    timestamps[:] = [t for t in timestamps if t > window_start]
    if len(timestamps) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Max {RATE_LIMIT_MAX} exports per hour.",
        )
    timestamps.append(now)


async def _daily_usage(user_id: str) -> int:
    today = str(date.today())
    if redis_manager.client:
        raw = await redis_manager.client.get(f"export:daily:{user_id}:{today}")
        return int(raw or 0)
    return _daily_export_store.get(user_id, {}).get(today, 0)


async def _check_daily_limit(user_id: str, plan: str, row_count: int) -> None:
    today = str(date.today())
    used = await _daily_usage(user_id)
    limit = _DAILY_EXPORT_LIMITS.get(plan, 1000)
    if used + row_count > limit:
        remaining = max(0, limit - used)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily export limit reached. Plan allows {limit} rows/day ({remaining} remaining).",
        )
    if redis_manager.client:
        key = f"export:daily:{user_id}:{today}"
        await redis_manager.client.incrby(key, row_count)
        await redis_manager.client.expire(key, 60 * 60 * 30)
    else:
        _daily_export_store[user_id][today] = used + row_count


def _get_bucket_expr(granularity: str):
    mapping = {
        "1min": "1 minute",
        "1hour": "1 hour",
        "1day": "1 day",
    }
    interval = mapping.get(granularity)
    if not interval:
        raise HTTPException(status_code=400, detail=f"Invalid granularity: {granularity}")
    return sa_func.time_bucket(text(f"'{interval}'::interval"), models.SensorReading.time)


@router.get("/preview")
async def export_preview(
    sensor_ids: str = Query(..., description="Comma-separated sensor IDs or 'all'"),
    metric_keys: str = Query(..., description="Comma-separated metric keys or 'all'"),
    start: datetime = Query(...),
    end: datetime = Query(...),
    district: str | None = Query(None),
    granularity: Literal["raw", "1min", "1hour", "1day"] = Query("1hour"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(resolve_api_key_or_user),
):
    if sensor_ids == "all":
        q = select(models.Sensor.id)
        if district:
            q = q.where(models.Sensor.type == district)
        result = await db.execute(q)
        id_list = [row[0] for row in result.all()]
    else:
        id_list = [sid.strip() for sid in sensor_ids.split(",")]

    if metric_keys == "all":
        result = await db.execute(select(models.MetricDefinition.key))
        key_list = [row[0] for row in result.all()]
    else:
        key_list = [k.strip() for k in metric_keys.split(",")]

    metric_subq = select(models.MetricDefinition.id, models.MetricDefinition.key).subquery()

    count_query = select(sa_func.count()).select_from(
        select(models.SensorReading.time).where(
            models.SensorReading.sensor_id.in_(id_list),
            models.SensorReading.metric_id == metric_subq.c.id,
            metric_subq.c.key.in_(key_list),
            models.SensorReading.time >= start,
            models.SensorReading.time <= end,
        ).limit(50000).subquery()
    )

    if granularity != "raw":
        bucket_expr = _get_bucket_expr(granularity)
        count_query = select(sa_func.count()).select_from(
            select(bucket_expr).where(
                models.SensorReading.sensor_id.in_(id_list),
                models.SensorReading.metric_id == metric_subq.c.id,
                metric_subq.c.key.in_(key_list),
                models.SensorReading.time >= start,
                models.SensorReading.time <= end,
            ).group_by(
                bucket_expr,
                models.SensorReading.sensor_id,
                metric_subq.c.key,
            ).subquery()
        )

    total = await db.scalar(count_query)
    user_plan = current_user.get("plan", SubscriptionPlan.FREE)
    daily_limit = _DAILY_EXPORT_LIMITS.get(user_plan, 1000)
    used = await _daily_usage(str(current_user["id"]))

    return {
        "row_count": total or 0,
        "daily_limit": daily_limit,
        "daily_used": used,
        "daily_remaining": max(0, daily_limit - used),
    }


@router.get("/sensors", response_class=Response)
async def export_sensors(
    sensor_ids: str = Query(..., description="Comma-separated sensor IDs or 'all'"),
    metric_keys: str = Query(..., description="Comma-separated metric keys or 'all'"),
    start: datetime = Query(...),
    end: datetime = Query(...),
    format_: str = Query("csv", alias="format", description="csv, json, parquet, geojson"),
    granularity: Literal["raw", "1min", "1hour", "1day"] = Query("1hour"),
    district: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(resolve_api_key_or_user),
):
    await _check_rate_limit(str(current_user["id"]))

    is_paid = current_user["plan"] in (SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE)
    if format_ == "parquet" and not is_paid:
        raise HTTPException(status_code=403, detail="Parquet export requires Pro or Enterprise plan")
    if granularity in ("raw", "1min") and not is_paid:
        raise HTTPException(status_code=403, detail=f"{granularity} granularity requires Pro or Enterprise plan")

    if sensor_ids == "all":
        q = select(models.Sensor.id)
        if district:
            q = q.where(models.Sensor.type == district)
        result = await db.execute(q)
        id_list = [row[0] for row in result.all()]
    else:
        id_list = [sid.strip() for sid in sensor_ids.split(",")]

    if metric_keys == "all":
        result = await db.execute(select(models.MetricDefinition.key))
        key_list = [row[0] for row in result.all()]
    else:
        key_list = [k.strip() for k in metric_keys.split(",")]

    metric_subq = select(models.MetricDefinition.id, models.MetricDefinition.key).subquery()

    sensor_info: dict[str, dict[str, Any]] = {}
    if format_ == "geojson":
        sensors_result = await db.execute(
            select(models.Sensor.id, models.Sensor.name, models.Sensor.latitude, models.Sensor.longitude)
            .where(models.Sensor.id.in_(id_list))
        )
        for row in sensors_result.all():
            sensor_info[row.id] = {"name": row.name, "lat": row.latitude, "lon": row.longitude}

    if granularity == "raw":
        query = select(
            models.SensorReading.time.label("bucket"),
            models.SensorReading.sensor_id,
            metric_subq.c.key,
            models.SensorReading.value_numeric,
            models.SensorReading.value_text,
            models.SensorReading.battery_level,
            models.SensorReading.quality_flag,
        ).join(
            metric_subq,
            models.SensorReading.metric_id == metric_subq.c.id,
        ).where(
            models.SensorReading.sensor_id.in_(id_list),
            metric_subq.c.key.in_(key_list),
            models.SensorReading.time >= start,
            models.SensorReading.time <= end,
        ).order_by(models.SensorReading.time.asc()).limit(100000)
        rows = (await db.execute(query)).all()

        raw_data = [
            {
                "time": row.bucket.isoformat(),
                "sensor_id": row.sensor_id,
                "metric_key": row.key,
                "value_numeric": row.value_numeric,
                "value_text": row.value_text,
                "battery_level": row.battery_level,
                "quality_flag": row.quality_flag,
            }
            for row in rows
        ]

        if len(raw_data) >= 100000 and format_ != "geojson":
            return Response(
                content="Export exceeds 100,000 rows. Narrow your date range or use aggregated granularity.",
                status_code=413,
                media_type="text/plain",
            )

        await _check_daily_limit(str(current_user["id"]), current_user.get("plan", SubscriptionPlan.FREE), len(raw_data))

        if format_ == "csv":
            return _csv_response(raw_data, start, end)
        elif format_ == "geojson":
            return _geojson_response(raw_data, sensor_info, start, end)
        return _json_response(raw_data, start, end)
    else:
        bucket_expr = _get_bucket_expr(granularity)
        query = select(
            bucket_expr.label("bucket"),
            models.SensorReading.sensor_id,
            metric_subq.c.key,
            sa_func.avg(models.SensorReading.value_numeric).label("avg_val"),
            sa_func.min(models.SensorReading.value_numeric).label("min_val"),
            sa_func.max(models.SensorReading.value_numeric).label("max_val"),
            sa_func.count(models.SensorReading.value_numeric).label("sample_count"),
        ).join(
            metric_subq,
            models.SensorReading.metric_id == metric_subq.c.id,
        ).where(
            models.SensorReading.sensor_id.in_(id_list),
            metric_subq.c.key.in_(key_list),
            models.SensorReading.time >= start,
            models.SensorReading.time <= end,
        ).group_by(
            bucket_expr,
            models.SensorReading.sensor_id,
            metric_subq.c.key,
        ).order_by(bucket_expr.asc())

        rows = (await db.execute(query)).all()
        agg_data = [
            {
                "bucket": row.bucket.isoformat(),
                "sensor_id": row.sensor_id,
                "metric_key": row.key,
                "avg_val": round(row.avg_val, 2) if row.avg_val is not None else None,
                "min_val": round(row.min_val, 2) if row.min_val is not None else None,
                "max_val": round(row.max_val, 2) if row.max_val is not None else None,
                "sample_count": row.sample_count,
            }
            for row in rows
        ]

        await _check_daily_limit(str(current_user["id"]), current_user.get("plan", SubscriptionPlan.FREE), len(agg_data))

        if format_ == "csv":
            return _csv_response(agg_data, start, end)
        elif format_ == "parquet":
            return _parquet_response(agg_data, start, end)
        elif format_ == "geojson":
            return _geojson_response(agg_data, sensor_info, start, end)
        return _json_response(agg_data, start, end)


def _csv_response(data: list[dict[str, Any]], start: datetime, end: datetime) -> Response:
    output = io.StringIO()
    if not data:
        writer = csv.writer(output)
        writer.writerow(["bucket", "sensor_id", "metric_key", "avg_val", "min_val", "max_val", "sample_count"])
    else:
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="smartcity_export_{timestamp}.csv"',
            "X-Row-Count": str(len(data)),
        },
    )


def _json_response(data: list[dict[str, Any]], start: datetime, end: datetime) -> Response:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    content = json.dumps(data, default=str, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="smartcity_export_{timestamp}.json"',
            "X-Row-Count": str(len(data)),
        },
    )


def _geojson_response(
    data: list[dict[str, Any]],
    sensor_info: dict[str, dict[str, Any]],
    start: datetime,
    end: datetime,
) -> Response:
    features = []
    seen = set()
    for row in data:
        sid = row.get("sensor_id", "")
        if sid not in seen and sid in sensor_info:
            seen.add(sid)
            info = sensor_info[sid]
            props = {k: v for k, v in row.items() if k not in ("sensor_id",)}
            props["name"] = info.get("name", sid)
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [info["lon"], info["lat"]],
                },
                "properties": props,
            })
    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    content = json.dumps(geojson, default=str, indent=2)
    return Response(
        content=content,
        media_type="application/geo+json",
        headers={
            "Content-Disposition": f'attachment; filename="smartcity_export_{timestamp}.geojson"',
            "X-Row-Count": str(len(data)),
        },
    )


def _parquet_response(data: list[dict[str, Any]], start: datetime, end: datetime) -> Response:
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Parquet export is not available on this server (pyarrow not installed).",
        )

    if not data:
        table = pa.table({
            "bucket": pa.array([], type=pa.timestamp("us")),
            "sensor_id": pa.array([], type=pa.string()),
            "metric_key": pa.array([], type=pa.string()),
            "avg_val": pa.array([], type=pa.float64()),
            "min_val": pa.array([], type=pa.float64()),
            "max_val": pa.array([], type=pa.float64()),
            "sample_count": pa.array([], type=pa.int64()),
        })
    else:
        arrays: dict[str, list[Any]] = defaultdict(list)
        for row in data:
            for k, v in row.items():
                arrays[k].append(v)
        table = pa.table({k: pa.array(v) for k, v in arrays.items()})

    buf = pa.BufferOutputStream()
    pq.write_table(table, buf)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    return Response(
        content=buf.getvalue().to_pybytes(),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="smartcity_export_{timestamp}.parquet"',
            "X-Row-Count": str(len(data)),
        },
    )
