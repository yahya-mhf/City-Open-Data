from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from ....core.dependencies import get_db

router = APIRouter()


@router.get("")
async def list_anomalies(
    since: datetime | None = Query(None),
    sensor_type: str | None = Query(None, alias="sensor_type"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    if not since:
        since = datetime.now(timezone.utc) - timedelta(hours=24)

    sensor_subq = select(models.Sensor.id)
    if sensor_type:
        sensor_subq = sensor_subq.where(models.Sensor.type == sensor_type)
    sensor_ids = [row[0] for row in (await db.execute(sensor_subq)).all()]

    query = select(
        models.AnomalyEvent.id,
        models.AnomalyEvent.sensor_id,
        models.AnomalyEvent.z_score,
        models.AnomalyEvent.method,
        models.AnomalyEvent.time,
        models.MetricDefinition.key.label("metric_key"),
        models.MetricDefinition.display_name.label("metric_name"),
        models.Sensor.name.label("sensor_name"),
        models.Sensor.type.label("sensor_type"),
    ).join(
        models.MetricDefinition,
        models.AnomalyEvent.metric_id == models.MetricDefinition.id,
    ).join(
        models.Sensor,
        models.AnomalyEvent.sensor_id == models.Sensor.id,
    ).where(
        models.AnomalyEvent.time >= since,
        models.AnomalyEvent.sensor_id.in_(sensor_ids),
    ).order_by(
        models.AnomalyEvent.time.desc()
    ).limit(limit)

    rows = (await db.execute(query)).all()
    return [
        {
            "id": str(row.id),
            "sensor_id": row.sensor_id,
            "sensor_name": row.sensor_name,
            "sensor_type": row.sensor_type,
            "metric_key": row.metric_key,
            "metric_name": row.metric_name,
            "z_score": round(float(row.z_score), 4),
            "method": row.method,
            "time": row.time.isoformat(),
        }
        for row in rows
    ]
