from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.schemas import SensorRead

from ....core.dependencies import get_db, redis_manager

router = APIRouter()


@router.get("/markers", response_model=list[dict])
async def get_map_markers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.Sensor).where(models.Sensor.status == "active")
    )
    sensors = result.scalars().all()

    sensor_ids = [str(s.id) for s in sensors]
    latest_readings = await redis_manager.get_all_latest_readings(sensor_ids)

    markers = []
    for sensor in sensors:
        latest = latest_readings.get(str(sensor.id), {})
        marker = {
            "id": str(sensor.id),
            "name": sensor.name,
            "latitude": sensor.latitude,
            "longitude": sensor.longitude,
            "status": sensor.status,
            "latest": latest,
        }
        markers.append(marker)

    return markers
