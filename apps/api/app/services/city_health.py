import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database.models import MetricDefinition, Sensor, SensorReading

CITY_HEALTH_CACHE_KEY = "city_health"
CITY_HEALTH_CACHE_TTL = 300

MetricRange = tuple[float, float, bool]

AQI_METRICS: dict[str, MetricRange] = {
    "co2": (350, 2000, True),
    "uv_index": (0, 11, True),
    "dust_storm_index": (0, 5, True),
    "pm25": (0, 300, True),
    "pm10": (0, 600, True),
}

LIVABILITY_METRICS: dict[str, MetricRange] = {
    "temperature": (15, 50, True),
    "humidity": (20, 90, True),
    "co2": (350, 2000, True),
    "noise": (20, 100, True),
    "uv_index": (0, 11, True),
    "traffic_density": (0, 200, True),
    "dust_storm_index": (0, 5, True),
}


def normalize(value: float, min_value: float, max_value: float, invert: bool) -> float:
    if max_value == min_value:
        return 50.0
    ratio = max(0.0, min(1.0, (value - min_value) / (max_value - min_value)))
    return (1.0 - ratio) * 100 if invert else ratio * 100


def trend(current: float | None, previous: float | None) -> str | None:
    if current is None or previous is None:
        return None
    diff = current - previous
    if diff > 1.0:
        return "up"
    if diff < -1.0:
        return "down"
    return "flat"


def status(score: float | None) -> str:
    if score is None:
        return "unavailable"
    if score >= 70:
        return "good"
    if score >= 40:
        return "moderate"
    return "critical"


def empty_result(now: datetime) -> dict[str, Any]:
    empty_card = {
        "score": None,
        "previous_score": None,
        "trend": None,
        "status": "unavailable",
        "sparkline": [],
        "data_available": False,
    }
    return {
        "aqi": {"name": "Air Quality Index", **empty_card},
        "heat_stress": {"name": "Heat Stress Index", **empty_card},
        "livability": {"name": "Urban Livability", **empty_card},
        "updated_at": now.isoformat(),
    }


def average(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def score_metric(values: dict[str, float], ranges: dict[str, MetricRange]) -> float | None:
    scores = [
        normalize(values[key], min_value, max_value, invert)
        for key, (min_value, max_value, invert) in ranges.items()
        if key in values
    ]
    return average(scores)


def heat_index(temperature: float, humidity: float) -> float:
    return (
        -8.78469475556
        + 1.61139411 * temperature
        + 2.33854883889 * humidity
        - 0.14611605 * temperature * humidity
        - 0.012308094 * temperature**2
        - 0.0164248277778 * humidity**2
        + 0.002211732 * temperature**2 * humidity
        + 0.00072546 * temperature * humidity**2
        - 0.000003582 * temperature**2 * humidity**2
    )


def heat_score(values: dict[str, float]) -> float | None:
    temperature = values.get("temperature")
    humidity = values.get("humidity")
    if temperature is None or humidity is None:
        return None
    return normalize(heat_index(temperature, humidity), 20, 60, True)


def normalized_sparkline(rows: dict[str, list[tuple[datetime, float]]], ranges: dict[str, MetricRange]) -> list[float]:
    by_hour: dict[datetime, list[float]] = {}
    for key, metric_rows in rows.items():
        metric_range = ranges.get(key)
        if not metric_range:
            continue
        min_value, max_value, invert = metric_range
        for bucket, value in metric_rows:
            by_hour.setdefault(bucket, []).append(normalize(value, min_value, max_value, invert))
    return [round(average(values) or 0, 1) for _, values in sorted(by_hour.items())[-24:]]


async def get_city_health(db: AsyncSession, redis_client: Any | None) -> dict[str, Any]:
    if redis_client:
        cached = await redis_client.get(CITY_HEALTH_CACHE_KEY)
        if cached:
            return json.loads(cached)

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=48)
    current_start = now - timedelta(hours=24)

    active_sensors = await db.execute(select(Sensor.id).where(Sensor.status == "active"))
    sensor_ids = [row[0] for row in active_sensors.all()]
    if not sensor_ids:
        result = empty_result(now)
        if redis_client:
            await redis_client.set(CITY_HEALTH_CACHE_KEY, json.dumps(result, default=str), ex=CITY_HEALTH_CACHE_TTL)
        return result

    metric_defs = await db.execute(select(MetricDefinition.id, MetricDefinition.key))
    metric_by_id = {row.id: row.key for row in metric_defs.all()}

    raw_rows = await db.execute(
        select(
            SensorReading.metric_id,
            sa_func.date_trunc("hour", SensorReading.time).label("bucket"),
            sa_func.avg(SensorReading.value_numeric).label("avg_value"),
        )
        .where(
            SensorReading.sensor_id.in_(sensor_ids),
            SensorReading.time >= since,
            SensorReading.value_numeric.isnot(None),
        )
        .group_by(SensorReading.metric_id, sa_func.date_trunc("hour", SensorReading.time))
        .order_by(sa_func.date_trunc("hour", SensorReading.time))
    )

    rows_by_key: dict[str, list[tuple[datetime, float]]] = {}
    for row in raw_rows.all():
        key = metric_by_id.get(row.metric_id)
        if key:
            rows_by_key.setdefault(key, []).append((row.bucket, float(row.avg_value)))

    if not rows_by_key:
        result = empty_result(now)
        if redis_client:
            await redis_client.set(CITY_HEALTH_CACHE_KEY, json.dumps(result, default=str), ex=CITY_HEALTH_CACHE_TTL)
        return result

    current_values = {
        key: average([value for bucket, value in rows if bucket >= current_start])
        for key, rows in rows_by_key.items()
    }
    previous_values = {
        key: average([value for bucket, value in rows if bucket < current_start])
        for key, rows in rows_by_key.items()
    }
    current = {key: value for key, value in current_values.items() if value is not None}
    previous = {key: value for key, value in previous_values.items() if value is not None}

    aqi_score = score_metric(current, AQI_METRICS)
    previous_aqi = score_metric(previous, AQI_METRICS)
    heat = heat_score(current)
    previous_heat = heat_score(previous)
    livability = score_metric(current, LIVABILITY_METRICS)
    previous_livability = score_metric(previous, LIVABILITY_METRICS)

    result = {
        "aqi": {
            "name": "Air Quality Index",
            "score": round(aqi_score, 1) if aqi_score is not None else None,
            "previous_score": round(previous_aqi, 1) if previous_aqi is not None else None,
            "trend": trend(aqi_score, previous_aqi),
            "status": status(aqi_score),
            "sparkline": normalized_sparkline(rows_by_key, AQI_METRICS),
            "data_available": aqi_score is not None,
        },
        "heat_stress": {
            "name": "Heat Stress Index",
            "score": round(heat, 1) if heat is not None else None,
            "previous_score": round(previous_heat, 1) if previous_heat is not None else None,
            "trend": trend(heat, previous_heat),
            "status": status(heat),
            "sparkline": normalized_sparkline(rows_by_key, {"temperature": LIVABILITY_METRICS["temperature"]}),
            "data_available": heat is not None,
        },
        "livability": {
            "name": "Urban Livability",
            "score": round(livability, 1) if livability is not None else None,
            "previous_score": round(previous_livability, 1) if previous_livability is not None else None,
            "trend": trend(livability, previous_livability),
            "status": status(livability),
            "sparkline": normalized_sparkline(rows_by_key, LIVABILITY_METRICS),
            "data_available": livability is not None,
        },
        "updated_at": now.isoformat(),
    }

    if redis_client:
        await redis_client.set(CITY_HEALTH_CACHE_KEY, json.dumps(result, default=str), ex=CITY_HEALTH_CACHE_TTL)

    return result
