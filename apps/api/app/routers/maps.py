from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from ..core.dependencies import get_db, redis_manager

router = APIRouter()


@router.get("/metrics")
async def list_map_metrics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.MetricDefinition).order_by(models.MetricDefinition.display_name)
    )
    metrics = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "key": m.key,
            "display_name": m.display_name,
            "unit": m.unit,
            "category": m.category,
            "min_value": m.min_value,
            "max_value": m.max_value,
        }
        for m in metrics
    ]


@router.get("/layers/{metric_key}")
async def get_layer_data(
    metric_key: str,
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
    sensors_needing_db = []

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
                "quality_flag": None,
                "time": latest.get("timestamp"),
            })
        else:
            sensors_needing_db.append(sensor)

    if sensors_needing_db:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        needed_ids = [str(s.id) for s in sensors_needing_db]

        latest_times_subq = (
            select(
                models.SensorReading.sensor_id,
                func.max(models.SensorReading.time).label("max_time"),
            )
            .join(
                models.MetricDefinition,
                models.SensorReading.metric_id == models.MetricDefinition.id,
            )
            .where(
                models.MetricDefinition.key == metric_key,
                models.SensorReading.time >= since,
                models.SensorReading.sensor_id.in_(needed_ids),
            )
            .group_by(models.SensorReading.sensor_id)
            .subquery()
        )

        db_latest = (
            select(
                models.SensorReading.sensor_id,
                models.SensorReading.value_numeric,
                models.SensorReading.quality_flag,
                models.SensorReading.time,
            )
            .join(
                latest_times_subq,
                and_(
                    models.SensorReading.sensor_id == latest_times_subq.c.sensor_id,
                    models.SensorReading.time == latest_times_subq.c.max_time,
                ),
            )
            .join(
                models.MetricDefinition,
                models.SensorReading.metric_id == models.MetricDefinition.id,
            )
            .where(models.MetricDefinition.key == metric_key)
        )
        db_rows = (await db.execute(db_latest)).all()
        db_map = {r.sensor_id: r for r in db_rows}

        for sensor in sensors_needing_db:
            sid = str(sensor.id)
            row = db_map.get(sid)
            if row and row.value_numeric is not None:
                result.append({
                    "sensor_id": sid,
                    "sensor_name": sensor.name,
                    "lat": sensor.latitude,
                    "lon": sensor.longitude,
                    "value": row.value_numeric,
                    "unit": metric.unit,
                    "quality_flag": row.quality_flag,
                    "time": row.time.isoformat() if row.time else None,
                })

    return result


@router.get("/layers/{metric_key}/history")
async def get_layer_history(
    metric_key: str,
    sensor_id: str | None = Query(None),
    from_: datetime = Query(..., alias="from"),
    to: datetime = Query(...),
    interval: str = Query("1h", pattern=r"^\d+[hmd]$"),
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

    bucket = func.time_bucket(
        text(f"'{interval}'::interval"),
        models.SensorReading.time,
    )

    query = (
        select(
            models.SensorReading.sensor_id,
            bucket.label("bucket_time"),
            func.avg(models.SensorReading.value_numeric).label("avg_value"),
        )
        .join(
            models.MetricDefinition,
            models.SensorReading.metric_id == models.MetricDefinition.id,
        )
        .where(
            models.MetricDefinition.key == metric_key,
            models.SensorReading.time >= from_,
            models.SensorReading.time <= to,
        )
        .group_by(models.SensorReading.sensor_id, bucket)
        .order_by(models.SensorReading.sensor_id, bucket.asc())
    )

    if sensor_id:
        query = query.where(models.SensorReading.sensor_id == sensor_id)

    rows = (await db.execute(query)).all()

    grouped: dict[str, list[dict]] = {}
    for r in rows:
        sid = r.sensor_id
        if sid not in grouped:
            grouped[sid] = []
        grouped[sid].append({
            "time": r.bucket_time.isoformat() if hasattr(r.bucket_time, "isoformat") else str(r.bucket_time),
            "avg_value": r.avg_value,
        })

    return [
        {"sensor_id": sid, "buckets": buckets}
        for sid, buckets in grouped.items()
    ]
