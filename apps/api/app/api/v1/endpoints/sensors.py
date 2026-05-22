from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status as fastapi_status
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func, text, extract
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.enums import SubscriptionPlan
from smart_city_shared.schemas import (
    SensorRead,
    SensorLatestRead,
    SensorReadingHistory,
    SensorStatsResponse,
    MetricStats,
    HeatmapCell,
    HistogramBucket,
)

from ....core.dependencies import get_db, redis_manager, get_optional_user, get_current_user


class SimulationRequest(BaseModel):
    adjustments: dict[str, float]


class MetricImpact(BaseModel):
    current: float
    hypothetical: float
    diff: float
    percent_change: float
    direction: str


class SimulationResponse(BaseModel):
    sensor_id: str
    sensor_name: str
    current: dict[str, float]
    hypothetical: dict[str, float]
    impact: dict[str, MetricImpact]

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
async def get_sensor_latest(sensor_id: str, db: AsyncSession = Depends(get_db)):
    sensor_result = await db.execute(select(models.Sensor.id).where(models.Sensor.id == sensor_id))
    if not sensor_result.scalar_one_or_none():
        raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    cached = await redis_manager.get_latest_reading(sensor_id)
    if cached:
        return SensorLatestRead(
            sensor_id=sensor_id,
            timestamp=cached.get("timestamp"),
            metrics=cached.get("metrics", {}),
        )
    return SensorLatestRead(sensor_id=sensor_id, metrics={})


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
            quality_flag=row.quality_flag,
        )
        for row in rows
    ]


@router.get("/{sensor_id}/stats", response_model=SensorStatsResponse)
async def get_sensor_stats(
    sensor_id: str,
    db: AsyncSession = Depends(get_db),
):
    cached = await redis_manager.get_latest_reading(sensor_id)
    current_metrics: dict[str, float] = {}
    if cached and cached.get("metrics"):
        current_metrics = {
            k: float(v) for k, v in cached["metrics"].items()
            if isinstance(v, (int, float, Decimal))
        }

    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    metric_defs = await db.execute(
        select(models.MetricDefinition)
        .join(models.SensorReading, models.SensorReading.metric_id == models.MetricDefinition.id)
        .where(
            models.MetricDefinition.is_active == True,
            models.SensorReading.sensor_id == sensor_id,
        )
        .distinct()
    )
    all_metrics = metric_defs.scalars().all()

    metric_id_map = {m.id: m.key for m in all_metrics}

    metric_ids = list(metric_id_map.keys())
    if not metric_ids:
        return SensorStatsResponse(sensor_id=sensor_id, metrics=[])

    hourly_agg = select(
        models.SensorReading.metric_id,
        sa_func.avg(models.SensorReading.value_numeric).label("avg_val"),
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.time >= since_24h,
        models.SensorReading.metric_id.in_(metric_ids),
        models.SensorReading.value_numeric.isnot(None),
    ).group_by(models.SensorReading.metric_id)

    monthly_agg = select(
        models.SensorReading.metric_id,
        sa_func.avg(models.SensorReading.value_numeric).label("avg_val"),
        sa_func.min(models.SensorReading.value_numeric).label("min_val"),
        sa_func.max(models.SensorReading.value_numeric).label("max_val"),
        sa_func.count(models.SensorReading.value_numeric).label("count_val"),
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.time >= since_month,
        models.SensorReading.metric_id.in_(metric_ids),
        models.SensorReading.value_numeric.isnot(None),
    ).group_by(models.SensorReading.metric_id)

    hourly_rows = (await db.execute(hourly_agg)).all()
    monthly_rows = (await db.execute(monthly_agg)).all()

    hourly_map: dict[str, float] = {}
    for row in hourly_rows:
        key = metric_id_map.get(row.metric_id, "")
        if key and row.avg_val is not None:
            hourly_map[key] = round(float(row.avg_val), 2)

    monthly_map: dict[str, dict] = {}
    for row in monthly_rows:
        key = metric_id_map.get(row.metric_id, "")
        if key:
            monthly_map[key] = {
                "avg": round(float(row.avg_val), 2) if row.avg_val is not None else None,
                "min": round(float(row.min_val), 2) if row.min_val is not None else None,
                "max": round(float(row.max_val), 2) if row.max_val is not None else None,
                "count": row.count_val or 0,
            }

    metric_stats = []
    for m in all_metrics:
        mn = monthly_map.get(m.key, {})
        metric_stats.append(
            MetricStats(
                metric_key=m.key,
                display_name=m.display_name,
                unit=m.unit,
                current_value=current_metrics.get(m.key),
                avg_24h=hourly_map.get(m.key),
                monthly_avg=mn.get("avg"),
                monthly_min=mn.get("min"),
                monthly_max=mn.get("max"),
                monthly_count=mn.get("count", 0),
            )
        )

    return SensorStatsResponse(sensor_id=sensor_id, metrics=metric_stats)


@router.get("/{sensor_id}/heatmap", response_model=list[HeatmapCell])
async def get_sensor_heatmap(
    sensor_id: str,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)

    metric_defs = await db.execute(
        select(models.MetricDefinition).where(models.MetricDefinition.is_active == True)
    )
    all_metrics = metric_defs.scalars().all()
    metric_id_map = {m.id: m.key for m in all_metrics}
    metric_ids = list(metric_id_map.keys())
    if not metric_ids:
        return []

    query = select(
        models.SensorReading.metric_id,
        extract("hour", models.SensorReading.time).label("hour"),
        extract("dow", models.SensorReading.time).label("weekday"),
        sa_func.avg(models.SensorReading.value_numeric).label("avg_value"),
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.time >= since,
        models.SensorReading.metric_id.in_(metric_ids),
        models.SensorReading.value_numeric.isnot(None),
    ).group_by(
        models.SensorReading.metric_id,
        extract("hour", models.SensorReading.time),
        extract("dow", models.SensorReading.time),
    ).order_by(
        models.SensorReading.metric_id,
        extract("dow", models.SensorReading.time),
        extract("hour", models.SensorReading.time),
    )

    rows = (await db.execute(query)).all()
    return [
        HeatmapCell(
            hour=int(row.hour),
            weekday=int(row.weekday),
            avg_value=round(float(row.avg_value), 2),
            metric_key=metric_id_map.get(row.metric_id, ""),
        )
        for row in rows
        if metric_id_map.get(row.metric_id)
    ]


@router.get("/{sensor_id}/distribution", response_model=list[HistogramBucket])
async def get_sensor_distribution(
    sensor_id: str,
    metric_key: str = Query(...),
    buckets: int = Query(10, ge=5, le=50),
    db: AsyncSession = Depends(get_db),
):
    metric_def = await db.execute(
        select(models.MetricDefinition).where(models.MetricDefinition.key == metric_key)
    )
    md = metric_def.scalar_one_or_none()
    if not md:
        raise HTTPException(status_code=404, detail=f"Metric '{metric_key}' not found")

    now = datetime.now(timezone.utc)
    since_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    range_query = select(
        sa_func.min(models.SensorReading.value_numeric),
        sa_func.max(models.SensorReading.value_numeric),
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.metric_id == md.id,
        models.SensorReading.time >= since_month,
        models.SensorReading.value_numeric.isnot(None),
    )

    range_result = (await db.execute(range_query)).one()
    min_val = range_result[0]
    max_val = range_result[1]
    if min_val is None or max_val is None or min_val == max_val:
        return []

    bucket_width = (max_val - min_val) / buckets

    bucket_expr = sa_func.floor(
        (models.SensorReading.value_numeric - min_val) / bucket_width
    )
    if bucket_width == 0:
        return []

    count_query = select(
        bucket_expr.label("bucket_idx"),
        sa_func.count(models.SensorReading.value_numeric).label("cnt"),
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.metric_id == md.id,
        models.SensorReading.time >= since_month,
        models.SensorReading.value_numeric.isnot(None),
    ).group_by(bucket_expr).order_by("bucket_idx")

    rows = (await db.execute(count_query)).all()

    result: list[HistogramBucket] = []
    bucket_counts = {min(int(row.bucket_idx), buckets - 1): row.cnt for row in rows}

    for i in range(buckets):
        rmin = round(min_val + i * bucket_width, 2)
        rmax = round(min_val + (i + 1) * bucket_width, 2)
        cnt = bucket_counts.get(i, 0)
        result.append(
            HistogramBucket(
                range_min=rmin,
                range_max=rmax,
                count=cnt or 0,
                metric_key=metric_key,
            )
        )

    return result


@router.post("/{sensor_id}/simulate", response_model=SimulationResponse)
async def simulate_scenario(
    sensor_id: str,
    body: SimulationRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    sensor_result = await db.execute(
        select(models.Sensor).where(models.Sensor.id == sensor_id)
    )
    sensor = sensor_result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")

    latest_query = select(
        models.SensorReading.metric_id,
        models.SensorReading.value_numeric,
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.value_numeric.isnot(None),
    ).order_by(
        models.SensorReading.time.desc()
    ).limit(50)

    rows = (await db.execute(latest_query)).all()

    metric_ids = set(r.metric_id for r in rows)
    defs_result = await db.execute(
        select(models.MetricDefinition).where(models.MetricDefinition.id.in_(metric_ids))
    )
    metric_defs = {md.id: md for md in defs_result.scalars().all()}

    current_metrics: dict[str, float] = {}
    seen: set[str] = set()
    for r in rows:
        md = metric_defs.get(r.metric_id)
        if md and md.key not in seen and r.value_numeric is not None:
            current_metrics[md.key] = float(r.value_numeric)
            seen.add(md.key)

    hypothetical: dict[str, float] = {}
    impact: dict[str, MetricImpact] = {}

    all_keys = set(list(current_metrics.keys()) + list(body.adjustments.keys()))
    for key in all_keys:
        curr = current_metrics.get(key)
        hyp = body.adjustments.get(key, curr)
        if curr is None or hyp is None:
            continue
        diff = round(hyp - curr, 4)
        pct = round((diff / curr) * 100, 2) if curr != 0 else 0.0
        direction = "up" if diff > 0 else "down" if diff < 0 else "unchanged"
        hypothetical[key] = hyp
        impact[key] = MetricImpact(
            current=curr,
            hypothetical=hyp,
            diff=diff,
            percent_change=pct,
            direction=direction,
        )

    return SimulationResponse(
        sensor_id=sensor.id,
        sensor_name=sensor.name,
        current=current_metrics,
        hypothetical=hypothetical,
        impact=impact,
    )
