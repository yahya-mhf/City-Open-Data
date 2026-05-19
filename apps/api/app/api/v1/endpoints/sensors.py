from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status as fastapi_status
from sqlalchemy import select, func as sa_func, text
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.enums import SubscriptionPlan
from smart_city_shared.schemas import SensorRead, SensorLatestRead, SensorReadingHistory

from ....core.dependencies import get_db, redis_manager, get_optional_user, get_current_user

router = APIRouter()


@router.get("", response_model=list[SensorRead])
async def list_sensors(
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    query = select(models.Sensor)
    if status_filter:
        query = query.where(models.Sensor.status == status_filter)
    query = query.order_by(models.Sensor.name)
    result = await db.execute(query)
    sensors = result.scalars().all()
    return sensors


@router.get("/{sensor_id}", response_model=SensorRead)
async def get_sensor(sensor_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Sensor).where(models.Sensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    return sensor


@router.get("/{sensor_id}/latest", response_model=SensorLatestRead)
async def get_sensor_latest(sensor_id: str):
    cached = await redis_manager.get_latest_reading(sensor_id)
    if cached:
        return SensorLatestRead(
            sensor_id=sensor_id,
            timestamp=cached.get("timestamp"),
            metrics=cached.get("metrics", {}),
            battery=cached.get("battery"),
        )
    return SensorLatestRead(sensor_id=sensor_id)


@router.get("/{sensor_id}/history", response_model=list[SensorReadingHistory])
async def get_sensor_history(
    sensor_id: str,
    metric_key: str | None = Query(None),
    hours: int = Query(24, le=168),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = Depends(get_optional_user),
):
    plan = current_user.get("plan", "free") if current_user else "free"
    if plan == SubscriptionPlan.FREE:
        if hours > 24:
            hours = 24
        if start and start < datetime.now(timezone.utc) - timedelta(hours=24):
            start = datetime.now(timezone.utc) - timedelta(hours=24)
    if start:
        since = start
    else:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
    until = end or datetime.now(timezone.utc)

    range_hours = (until - since).total_seconds() / 3600
    use_buckets = range_hours > 24

    metric_join = select(models.MetricDefinition.id, models.MetricDefinition.key).subquery()

    if use_buckets:
        bucket_width = "1 hour"
        bucket = sa_func.time_bucket(text("'1 hour'::interval"), models.SensorReading.time)
        query = select(
            bucket.label("time"),
            metric_join.c.key,
            sa_func.avg(models.SensorReading.value_numeric).label("value_numeric"),
            sa_func.min(models.SensorReading.value_text).label("value_text"),
            sa_func.avg(models.SensorReading.battery_level).label("battery_level"),
            sa_func.max(models.SensorReading.quality_flag).label("quality_flag"),
        ).join(
            metric_join,
            models.SensorReading.metric_id == metric_join.c.id,
        ).where(
            models.SensorReading.sensor_id == sensor_id,
            models.SensorReading.time >= since,
            models.SensorReading.time <= until,
        ).group_by(
            bucket,
            metric_join.c.key,
        ).order_by(bucket.asc())
    else:
        query = select(
            models.SensorReading.time,
            metric_join.c.key,
            models.SensorReading.value_numeric,
            models.SensorReading.value_text,
            models.SensorReading.battery_level,
            models.SensorReading.quality_flag,
        ).join(
            metric_join,
            models.SensorReading.metric_id == metric_join.c.id,
        ).where(
            models.SensorReading.sensor_id == sensor_id,
            models.SensorReading.time >= since,
            models.SensorReading.time <= until,
        ).order_by(models.SensorReading.time.asc())

    if metric_key:
        query = query.where(metric_join.c.key == metric_key)

    query = query.limit(1000)

    result = await db.execute(query)
    rows = result.all()
    return [
        SensorReadingHistory(
            time=row.time,
            metric_key=row.key,
            value_numeric=row.value_numeric,
            value_text=row.value_text,
            battery_level=row.battery_level,
            quality_flag=row.quality_flag,
        )
        for row in rows
    ]
