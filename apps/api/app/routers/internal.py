import math
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_shared.config import settings
from smart_city_database.models import MetricDefinition, Sensor, SensorReading

from ..core.dependencies import get_db

router = APIRouter(tags=["Internal"])


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _diurnal_temp(hour: float) -> float:
    if 5 <= hour <= 14:
        return -4.0 * math.cos(math.pi * (hour - 5) / 9)
    if 14 < hour <= 23:
        return 4.0 * math.cos(math.pi * (hour - 23) / 9)
    return -4.0


def _diurnal_co2(hour: float) -> float:
    if 7 <= hour <= 9:
        return 120.0 * math.sin(math.pi * (hour - 7) / 2)
    if 17 <= hour <= 19:
        return 120.0 * math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_pm(hour: float) -> float:
    if 7 <= hour <= 9:
        return 30.0 * math.sin(math.pi * (hour - 7) / 2)
    if 17 <= hour <= 19:
        return 30.0 * math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_noise(hour: float) -> float:
    if 7 <= hour <= 9:
        return 15.0 * math.sin(math.pi * (hour - 7) / 2)
    if 12 <= hour <= 14:
        return -5.0 * math.sin(math.pi * (hour - 12) / 2)
    if 17 <= hour <= 19:
        return 15.0 * math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_water(hour: float) -> float:
    return -0.3 * math.cos(2 * math.pi * (hour - 14) / 24)


def _diurnal_uv(hour: float) -> float:
    if 6 <= hour <= 18:
        return 6.0 * math.sin(math.pi * (hour - 6) / 12)
    return 0.0


def _diurnal_traffic(hour: float) -> float:
    if 7 <= hour <= 9:
        return 60.0 * math.sin(math.pi * (hour - 7) / 2)
    if 17 <= hour <= 19:
        return 60.0 * math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_load(hour: float) -> float:
    if 8 <= hour <= 12:
        return 400.0 * math.sin(math.pi * (hour - 8) / 4)
    if 14 <= hour <= 17:
        return 300.0 * math.sin(math.pi * (hour - 14) / 3)
    return 0.0


def _dust_spike(hour: float, temp: float, humid: float) -> float:
    if temp < 30 or humid > 30:
        return 0.0
    if 12 <= hour <= 17:
        intensity = (temp - 30) / 20 * (1 - humid / 100) * (1 - abs(hour - 14.5) / 2.5)
        return max(0.0, intensity)
    return 0.0


def _estimate_humidity(hour: float, seasonal: float) -> float:
    temp = 24.0 + seasonal + _diurnal_temp(hour)
    return 70.0 - (temp - 15.0) * 0.8


_METRIC_GENERATORS: dict[str, callable] = {
    "temperature": lambda h, s: _clamp(24.0 + s + _diurnal_temp(h) + random.gauss(0, 1.0), -5, 50),
    "humidity": lambda h, s: _clamp(70.0 - (24.0 + s + _diurnal_temp(h) - 15.0) * 0.8 + random.gauss(0, 3), 10, 100),
    "co2": lambda h, s: _clamp(450.0 + _diurnal_co2(h) + random.gauss(0, 15), 350, 2000),
    "pressure": lambda h, s: _clamp(1013.0 + s * 0.3 + random.gauss(0, 2), 980, 1050),
    "pm25": lambda h, s: _clamp(25.0 + _diurnal_pm(h) + s * 0.5 + random.gauss(0, 3), 0, 500),
    "pm10": lambda h, s: _clamp(45.0 + _diurnal_pm(h) * 1.2 + s * 0.8 + random.gauss(0, 5), 0, 1000),
    "noise": lambda h, s: _clamp(55.0 + _diurnal_noise(h) + random.gauss(0, 2), 20, 120),
    "water_level": lambda h, s: _clamp(2.5 + _diurnal_water(h) + random.gauss(0, 0.3), 0, 10),
    "uv_index": lambda h, s: _clamp(_diurnal_uv(h) + s * 0.3 + random.gauss(0, 0.3), 0, 14),
    "traffic_density": lambda h, s: _clamp(40.0 + _diurnal_traffic(h) + random.gauss(0, 5), 0, 200),
    "energy_grid_load": lambda h, s: _clamp(2000.0 + s * 40 + _diurnal_load(h) + _diurnal_temp(h) * 30 + random.gauss(0, 75), 0, 5000),
    "dust_storm_index": lambda h, s: _clamp(_dust_spike(h, 24.0 + s + _diurnal_temp(h), _estimate_humidity(h, s)) + random.gauss(0, 0.2), 0, 5),
}


def _seasonal(day_of_year: int) -> float:
    return 8.0 * math.sin(2 * math.pi * (day_of_year - 80) / 365)


def _generate_value(metric_key: str, hour: float, seasonal: float) -> float:
    gen = _METRIC_GENERATORS.get(metric_key)
    if gen is None:
        return 0.0
    return round(gen(hour, seasonal), 2)


@router.post("/seed-latest")
async def seed_latest(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    secret = request.headers.get("INTERNAL_SECRET")
    if not secret or secret != settings.INTERNAL_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )

    sensors_result = await db.execute(
        select(Sensor).where(Sensor.status == "active")
    )
    sensors = sensors_result.scalars().all()

    metrics_result = await db.execute(
        select(MetricDefinition).where(MetricDefinition.is_active == True)
    )
    metrics = metrics_result.scalars().all()

    if not sensors or not metrics:
        return {"inserted": 0, "message": "No active sensors or metrics found"}

    now = datetime.now(timezone.utc)
    hour = now.hour + now.minute / 60.0
    day_of_year = now.timetuple().tm_yday
    seasonal = _seasonal(day_of_year)

    readings: list[SensorReading] = []
    for sensor in sensors:
        battery = round(
            _clamp(100.0 + random.gauss(0, 2) - random.uniform(0, 0.5), 20, 100), 1
        )
        for metric in metrics:
            value = _generate_value(metric.key, hour, seasonal)
            readings.append(
                SensorReading(
                    time=now,
                    sensor_id=sensor.id,
                    metric_id=metric.id,
                    value_numeric=value,
                    battery_level=battery,
                    quality_flag="good",
                )
            )

    db.add_all(readings)
    await db.commit()

    return {
        "inserted": len(readings),
        "timestamp": now.isoformat(),
        "sensors": len(sensors),
        "metrics": len(metrics),
    }
