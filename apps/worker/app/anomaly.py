"""Rolling Z-score + IQR anomaly detection integrated into the worker."""

import statistics
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database.models import MetricDefinition, SensorReading

WINDOW_HOURS = 24
Z_WARNING = 2.0
Z_CRITICAL = 3.0
MIN_POINTS = 10


def _z_score(value: float, mean: float, std: float) -> float:
    if std == 0:
        return 0.0
    return (value - mean) / std


def _iqr_bounds(values: list[float]) -> tuple[float, float]:
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    q1 = sorted_vals[n // 4]
    q3 = sorted_vals[(3 * n) // 4]
    iqr = q3 - q1
    return q1 - 1.5 * iqr, q3 + 1.5 * iqr


async def detect_anomaly(
    sensor_id: str,
    metric_id: Any,
    value: float,
    db: AsyncSession,
) -> dict[str, Any] | None:
    since = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)

    result = await db.execute(
        select(
            sa_func.avg(SensorReading.value_numeric),
            sa_func.stddev(SensorReading.value_numeric),
        ).where(
            SensorReading.sensor_id == sensor_id,
            SensorReading.metric_id == metric_id,
            SensorReading.time >= since,
            SensorReading.value_numeric.isnot(None),
        )
    )
    row = result.one()
    mean = row[0]
    std = row[1]

    if mean is None or std is None:
        return None

    z = _z_score(value, float(mean), float(std))
    z_method = abs(z) > Z_WARNING

    all_readings = await db.execute(
        select(SensorReading.value_numeric).where(
            SensorReading.sensor_id == sensor_id,
            SensorReading.metric_id == metric_id,
            SensorReading.time >= since,
            SensorReading.value_numeric.isnot(None),
        )
    )
    reading_values = [float(r[0]) for r in all_readings.all()]

    iqr_method = False
    if len(reading_values) >= MIN_POINTS:
        lower, upper = _iqr_bounds(reading_values)
        iqr_method = value < lower or value > upper

    if not z_method and not iqr_method:
        return None

    severity: str
    if abs(z) > Z_CRITICAL and iqr_method:
        severity = "critical"
    elif abs(z) > Z_WARNING or iqr_method:
        severity = "warning"
    else:
        return None

    method_parts = []
    if z_method:
        method_parts.append("zscore")
    if iqr_method:
        method_parts.append("iqr")

    return {
        "sensor_id": sensor_id,
        "metric_id": metric_id,
        "z_score": round(z, 4),
        "method": "+".join(method_parts),
        "severity": severity,
        "value": value,
        "mean": round(float(mean), 2),
        "std": round(float(std), 2),
    }
