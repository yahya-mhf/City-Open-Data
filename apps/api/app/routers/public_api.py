import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.constants import API_KEY_TIERS

from ..middleware.api_key_auth import verify_api_key
from ..core.dependencies import get_db, redis_manager

logger = logging.getLogger("smart_city.public_api")

router = APIRouter()


@router.get("/sensors")
async def public_list_sensors(
    db: AsyncSession = Depends(get_db),
    api_key: dict = Depends(verify_api_key),
):
    result = await db.execute(
        select(models.Sensor).where(models.Sensor.status == "active").order_by(models.Sensor.name)
    )
    sensors = result.scalars().all()
    sensor_ids = [str(s.id) for s in sensors]
    latest_readings = await redis_manager.get_all_latest_readings(sensor_ids)

    allowed = api_key.get("allowed_metrics")
    data = []
    for s in sensors:
        sid = str(s.id)
        reading = latest_readings.get(sid, {}) or {}
        metrics = reading.get("metrics", {})
        if allowed is not None:
            metrics = {k: v for k, v in metrics.items() if k in allowed}
        data.append({
            "id": sid,
            "name": s.name,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "status": s.status,
            "latest": {
                "timestamp": reading.get("timestamp"),
                "metrics": metrics,
                "battery": reading.get("battery"),
            },
        })
    return data


@router.get("/sensors/{sensor_id}/readings")
async def public_sensor_readings(
    sensor_id: str,
    metric: str | None = Query(None),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None, alias="to"),
    interval: str = Query("1h", pattern=r"^\d+[hmd]$"),
    db: AsyncSession = Depends(get_db),
    api_key: dict = Depends(verify_api_key),
):
    max_days = api_key["history_days"]
    now = datetime.now(timezone.utc)
    to = to or now
    from_ = from_ or (to - timedelta(days=max_days))

    if (to - from_).days > max_days:
        from_ = to - timedelta(days=max_days)

    sensor = await db.execute(select(models.Sensor).where(models.Sensor.id == sensor_id))
    if not sensor.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sensor not found")

    metric_join = select(models.MetricDefinition.id, models.MetricDefinition.key).subquery()

    if metric:
        metric_filter = metric_join.c.key == metric
        allowed = api_key.get("allowed_metrics")
        if allowed is not None and metric not in allowed:
            raise HTTPException(status_code=403, detail="Metric not allowed for this API key")
    else:
        metric_filter = True

    bucket = func.time_bucket(text(f"'{interval}'::interval"), models.SensorReading.time)
    query = (
        select(
            bucket.label("bucket_time"),
            metric_join.c.key,
            func.avg(models.SensorReading.value_numeric).label("avg_value"),
            func.min(models.SensorReading.value_numeric).label("min_value"),
            func.max(models.SensorReading.value_numeric).label("max_value"),
            func.count(models.SensorReading.value_numeric).label("sample_count"),
        )
        .join(metric_join, models.SensorReading.metric_id == metric_join.c.id)
        .where(
            models.SensorReading.sensor_id == sensor_id,
            models.SensorReading.time >= from_,
            models.SensorReading.time <= to,
            metric_filter,
        )
        .group_by(bucket, metric_join.c.key)
        .order_by(bucket.asc())
    )

    rows = (await db.execute(query)).all()
    return [
        {
            "time": r.bucket_time.isoformat() if hasattr(r.bucket_time, "isoformat") else str(r.bucket_time),
            "metric_key": r.key,
            "avg_value": r.avg_value,
            "min_value": r.min_value,
            "max_value": r.max_value,
            "sample_count": r.sample_count,
        }
        for r in rows
    ]


@router.get("/metrics")
async def public_list_metrics(
    db: AsyncSession = Depends(get_db),
    api_key: dict = Depends(verify_api_key),
):
    result = await db.execute(
        select(models.MetricDefinition).order_by(models.MetricDefinition.display_name)
    )
    metrics = result.scalars().all()
    allowed = api_key.get("allowed_metrics")
    data = []
    for m in metrics:
        if allowed is not None and m.key not in allowed:
            continue
        data.append({
            "key": m.key,
            "display_name": m.display_name,
            "unit": m.unit,
            "category": m.category,
            "min_value": m.min_value,
            "max_value": m.max_value,
        })
    return data


@router.get("/layers/{metric_key}")
async def public_layer_data(
    metric_key: str,
    db: AsyncSession = Depends(get_db),
    api_key: dict = Depends(verify_api_key),
):
    allowed = api_key.get("allowed_metrics")
    if allowed is not None and metric_key not in allowed:
        raise HTTPException(status_code=403, detail="Metric not allowed for this API key")

    metric_result = await db.execute(
        select(models.MetricDefinition).where(models.MetricDefinition.key == metric_key)
    )
    metric = metric_result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status_code=404, detail=f"Metric '{metric_key}' not found")

    max_metrics = api_key["max_metrics"]
    if max_metrics != -1:
        pass

    sensors_result = await db.execute(
        select(models.Sensor).where(models.Sensor.status == "active")
    )
    sensors = sensors_result.scalars().all()
    if not sensors:
        return []

    sensor_ids = [str(s.id) for s in sensors]
    sensor_map = {s.id: s for s in sensors}
    latest_readings = await redis_manager.get_all_latest_readings(sensor_ids)

    result = []
    for sid in sensor_ids:
        sensor = sensor_map[sid]
        latest = latest_readings.get(sid)
        if latest and isinstance(latest, dict) and "metrics" in latest and metric_key in latest["metrics"]:
            result.append({
                "sensor_id": sid,
                "sensor_name": sensor.name,
                "lat": sensor.latitude,
                "lon": sensor.longitude,
                "value": latest["metrics"][metric_key],
                "unit": metric.unit,
                "time": latest.get("timestamp"),
            })

    return result


@router.get("/intelligence/latest")
async def public_intelligence_latest(
    analysis_type: str = Query(default="opportunities"),
    api_key: dict = Depends(verify_api_key),
):
    if not redis_manager.client:
        return []
    pattern = f"intelligence:{analysis_type}:*"
    keys = []
    cursor = 0
    while True:
        cursor, batch = await redis_manager.client.scan(cursor=cursor, match=pattern, count=10)
        keys.extend(batch)
        if cursor == 0:
            break
    if not keys:
        return []

    cached = await redis_manager.client.get(keys[-1])
    if cached:
        return json.loads(cached)
    return []


@router.get("/status")
async def public_status(
    db: AsyncSession = Depends(get_db),
):
    sensor_count_result = await db.execute(
        select(func.count(models.Sensor.id)).where(models.Sensor.status == "active")
    )
    sensor_count = sensor_count_result.scalar()

    last_reading_result = await db.execute(
        select(func.max(models.SensorReading.time))
    )
    last_reading = last_reading_result.scalar()

    return {
        "status": "operational",
        "sensor_count": sensor_count or 0,
        "last_reading_time": last_reading.isoformat() if last_reading else None,
        "version": "1.0.0",
    }
