from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.schemas import (
    SensorReadingHistory,
    ExportResponse,
    AggregateResponse,
)

from smart_city_shared.enums import SubscriptionPlan
from ....core.dependencies import get_db, track_usage
from fastapi import status as fastapi_status

router = APIRouter()


@router.get("/sensors/{sensor_id}/history", response_model=list[SensorReadingHistory])
async def get_analytics_history(
    sensor_id: str,
    metric_key: str | None = Query(None),
    from_date: datetime = Query(default=None, alias="from"),
    to_date: datetime = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(track_usage),
):
    if current_user["plan"] not in (SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE):
        raise HTTPException(status_code=fastapi_status.HTTP_403_FORBIDDEN, detail="Paid subscription required")
    if not from_date:
        from_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if not to_date:
        to_date = datetime.now(timezone.utc)

    metric_join = select(models.MetricDefinition.id, models.MetricDefinition.key).subquery()
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
        models.SensorReading.time >= from_date,
        models.SensorReading.time <= to_date,
    )

    if metric_key:
        query = query.where(metric_join.c.key == metric_key)

    query = query.order_by(models.SensorReading.time.desc())
    query = query.limit(10000)

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


@router.get("/export", response_model=ExportResponse)
async def export_data(
    sensor_id: str = Query(...),
    metric_key: str = Query(...),
    from_date: datetime = Query(default=None, alias="from"),
    to_date: datetime = Query(default=None, alias="to"),
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(track_usage),
):
    if current_user["plan"] not in (SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE):
        raise HTTPException(status_code=fastapi_status.HTTP_403_FORBIDDEN, detail="Paid subscription required")
    if not from_date:
        from_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if not to_date:
        to_date = datetime.now(timezone.utc)

    metric_subq = select(models.MetricDefinition.id).where(
        models.MetricDefinition.key == metric_key
    ).scalar_subquery()

    query = select(
        models.SensorReading.time,
        models.SensorReading.value_numeric,
        models.SensorReading.value_text,
        models.SensorReading.battery_level,
        models.SensorReading.quality_flag,
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.metric_id == metric_subq,
        models.SensorReading.time >= from_date,
        models.SensorReading.time <= to_date,
    ).order_by(models.SensorReading.time.asc())

    result = await db.execute(query)
    rows = result.all()

    data = [
        {
            "time": row.time.isoformat(),
            "value_numeric": row.value_numeric,
            "value_text": row.value_text,
            "battery_level": row.battery_level,
            "quality_flag": row.quality_flag,
        }
        for row in rows
    ]

    if format == "csv":
        csv_lines = ["time,value_numeric,value_text,battery_level,quality_flag"]
        for row in data:
            csv_lines.append(
                f"{row['time']},{row['value_numeric']},{row['value_text'] or ''},{row['battery_level'] or ''},{row['quality_flag']}"
            )
        return ExportResponse(
            sensor_id=sensor_id,
            metric_key=metric_key,
            from_date=from_date,
            to_date=to_date,
            data=csv_lines,
            format="csv",
        )

    return ExportResponse(
        sensor_id=sensor_id,
        metric_key=metric_key,
        from_date=from_date,
        to_date=to_date,
        data=data,
        format="json",
    )


@router.get("/aggregate", response_model=list[AggregateResponse])
async def aggregate_data(
    sensor_id: str = Query(...),
    metric_keys: str = Query(None, alias="metrics"),
    from_date: datetime = Query(default=None, alias="from"),
    to_date: datetime = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(track_usage),
):
    if current_user["plan"] not in (SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE):
        raise HTTPException(status_code=fastapi_status.HTTP_403_FORBIDDEN, detail="Paid subscription required")
    if not from_date:
        from_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if not to_date:
        to_date = datetime.now(timezone.utc)

    metric_query = select(models.MetricDefinition)
    if metric_keys:
        keys_list = [k.strip() for k in metric_keys.split(",")]
        metric_query = metric_query.where(models.MetricDefinition.key.in_(keys_list))

    metrics = await db.execute(metric_query)
    metric_defs = metrics.scalars().all()

    results = []
    for md in metric_defs:
        agg_query = select(
            sa_func.avg(models.SensorReading.value_numeric),
            sa_func.min(models.SensorReading.value_numeric),
            sa_func.max(models.SensorReading.value_numeric),
            sa_func.count(models.SensorReading.value_numeric),
        ).where(
            models.SensorReading.sensor_id == sensor_id,
            models.SensorReading.metric_id == md.id,
            models.SensorReading.time >= from_date,
            models.SensorReading.time <= to_date,
        )
        agg_result = await db.execute(agg_query)
        row = agg_result.one()

        results.append(
            AggregateResponse(
                metric_key=md.key,
                sensor_id=sensor_id,
                avg=round(row[0], 2) if row[0] is not None else None,
                min=round(row[1], 2) if row[1] is not None else None,
                max=round(row[2], 2) if row[2] is not None else None,
                count=row[3] or 0,
                from_date=from_date,
                to_date=to_date,
            )
        )

    return results
