import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from prometheus_client import make_asgi_app

from smart_city_shared.config import settings
from smart_city_observability import setup_logging

from .api.v1.routes import router as v1_router
from .core.redis_client import redis_manager
from .core.dependencies import get_db
from .routers.maps import router as maps_router
from .routers.forecast import router as forecast_router
from .routers.intelligence import router as intelligence_router
from .routers.public_api import router as public_api_router
from .routers.chatbot import router as chatbot_router
from .routers.internal import router as internal_router
from .core.minio_client import minio_manager
from .core.websocket_handler import websocket_router, redis_subscriber

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await redis_manager.connect()
    await minio_manager.ensure_bucket()
    task = asyncio.create_task(redis_subscriber())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await redis_manager.close()


app = FastAPI(
    title="Urban Pulse API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")
app.include_router(maps_router, prefix="/api/v1/maps")
app.include_router(forecast_router, prefix="/api/v1/maps")
app.include_router(intelligence_router, prefix="/api/v1/intelligence")
app.include_router(public_api_router, prefix="/public/v1")
app.include_router(chatbot_router, prefix="/api/v1/chatbot")
app.include_router(internal_router, prefix="/internal")
app.include_router(websocket_router)

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/ready")
async def ready():
    return {"status": "ready"}


CITY_HEALTH_CACHE_KEY = "city_health"
CITY_HEALTH_CACHE_TTL = 300


def _normalize(value: float, min_val: float, max_val: float, invert: bool = False) -> float:
    if max_val == min_val:
        return 50.0
    ratio = (value - min_val) / (max_val - min_val)
    ratio = max(0.0, min(1.0, ratio))
    return (1.0 - ratio) * 100 if invert else ratio * 100


def _trend(current: float, previous: float) -> str:
    diff = current - previous
    if diff > 1.0:
        return "up"
    if diff < -1.0:
        return "down"
    return "flat"


def _status_good_moderate_critical(score: float, inverted: bool = False) -> str:
    if inverted:
        if score < 30:
            return "good"
        if score < 60:
            return "moderate"
        return "critical"
    if score >= 70:
        return "good"
    if score >= 40:
        return "moderate"
    return "critical"


@app.get("/api/v1/city-health")
async def city_health(db: AsyncSession = Depends(get_db)):
    import json
    from sqlalchemy import select, func as sa_func, text
    from sqlalchemy.ext.asyncio import AsyncSession
    from smart_city_database.models import Sensor, SensorReading, MetricDefinition
    from datetime import datetime, timedelta, timezone

    cached = await redis_manager.client.get(CITY_HEALTH_CACHE_KEY) if redis_manager.client else None
    if cached:
        return json.loads(cached)

    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_48h = now - timedelta(hours=48)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)

    active_sensors = await db.execute(
        select(Sensor.id).where(Sensor.status == "active")
    )
    sensor_ids = [row[0] for row in active_sensors.all()]
    if not sensor_ids:
        empty = {"aqi": {"name": "AQI", "score": 50, "previous_score": 50, "trend": "flat", "status": "moderate", "sparkline": []}, "heat_stress": {"name": "Heat Stress", "score": 50, "previous_score": 50, "trend": "flat", "status": "moderate", "sparkline": []}, "livability": {"name": "Livability", "score": 50, "previous_score": 50, "trend": "flat", "status": "moderate", "sparkline": []}, "updated_at": now.isoformat()}
        if redis_manager.client:
            await redis_manager.client.set(CITY_HEALTH_CACHE_KEY, json.dumps(empty, default=str), ex=CITY_HEALTH_CACHE_TTL)
        return empty

    defs = await db.execute(select(MetricDefinition))
    all_defs = defs.scalars().all()

    metric_by_key: dict[str, str] = {m.key: m.id for m in all_defs}
    metric_id_by_uuid: dict[str, str] = {str(m.id): m.key for m in all_defs}

    metric_ids = list(metric_by_key.values())
    if not metric_ids:
        empty = {"aqi": {"name": "AQI", "score": 50, "previous_score": 50, "trend": "flat", "status": "moderate", "sparkline": []}, "heat_stress": {"name": "Heat Stress", "score": 50, "previous_score": 50, "trend": "flat", "status": "moderate", "sparkline": []}, "livability": {"name": "Livability", "score": 50, "previous_score": 50, "trend": "flat", "status": "moderate", "sparkline": []}, "updated_at": now.isoformat()}
        if redis_manager.client:
            await redis_manager.client.set(CITY_HEALTH_CACHE_KEY, json.dumps(empty, default=str), ex=CITY_HEALTH_CACHE_TTL)
        return empty

    bucket = sa_func.time_bucket(text("'1 hour'::interval"), SensorReading.time)

    raw = await db.execute(
        select(
            SensorReading.metric_id,
            bucket.label("bucket"),
            sa_func.avg(SensorReading.value_numeric).label("avg_val"),
        ).where(
            SensorReading.sensor_id.in_(sensor_ids),
            SensorReading.time >= since_48h,
            SensorReading.value_numeric.isnot(None),
        ).group_by(
            SensorReading.metric_id,
            bucket,
        ).order_by(
            SensorReading.metric_id,
            bucket,
        )
    )
    rows = raw.all()

    raw_data: dict[str, dict[str, list[float]]] = {}
    for row in rows:
        key = metric_id_by_uuid.get(str(row.metric_id), "")
        if not key:
            continue
        ts = row.bucket.isoformat() if hasattr(row.bucket, "isoformat") else str(row.bucket)
        raw_data.setdefault(key, {})
        raw_data[key].setdefault("times", [])
        raw_data[key].setdefault("values", [])
        raw_data[key]["times"].append(ts)
        raw_data[key]["values"].append(float(row.avg_val))

    latest_values: dict[str, float] = {}
    for key, data in raw_data.items():
        if data["values"]:
            latest_values[key] = data["values"][-1]

    def today_avg(key: str) -> float | None:
        vals = raw_data.get(key, {}).get("values", [])
        times = raw_data.get(key, {}).get("times", [])
        if not vals:
            return None
        today_vals = [v for v, t in zip(vals, times) if t >= today_start.isoformat()]
        return sum(today_vals) / len(today_vals) if today_vals else None

    def yesterday_avg(key: str) -> float | None:
        vals = raw_data.get(key, {}).get("values", [])
        times = raw_data.get(key, {}).get("times", [])
        if not vals:
            return None
        yesterday_vals = [v for v, t in zip(vals, times) if yesterday_start.isoformat() <= t < today_start.isoformat()]
        return sum(yesterday_vals) / len(yesterday_vals) if yesterday_vals else None

    def normalized_score(key: str, min_v: float, max_v: float, invert: bool = True) -> float:
        today = today_avg(key)
        if today is None:
            return 50.0
        return _normalize(today, min_v, max_v, invert)

    def sparkline_24h(key: str) -> list[float | None]:
        vals = raw_data.get(key, {}).get("values", [])
        times = raw_data.get(key, {}).get("times", [])
        last_24 = [(v, t) for v, t in zip(vals, times) if t >= since_24h.isoformat()]
        return [v for v, _ in last_24[-24:]]

    # AQI: co2 (40%), uv_index (20%), dust_storm_index (20%), pm25 (10%), pm10 (10%)
    aqi_scores: list[float] = []
    aqi_components: list[str] = []
    for mk in ["co2", "uv_index", "dust_storm_index", "pm25", "pm10"]:
        if mk in raw_data:
            aqi_scores.append(normalized_score(mk, {
                "co2": (350, 2000),
                "uv_index": (0, 11),
                "dust_storm_index": (0, 5),
                "pm25": (0, 300),
                "pm10": (0, 600),
            }.get(mk, (0, 100))[0], {
                "co2": (350, 2000),
                "uv_index": (0, 11),
                "dust_storm_index": (0, 5),
                "pm25": (0, 300),
                "pm10": (0, 600),
            }.get(mk, (0, 100))[1], True))
            aqi_components.append(mk)
    aqi_total = sum(aqi_scores) / len(aqi_scores) if aqi_scores else 50.0

    prev_aqi_scores: list[float] = []
    for mk in aqi_components:
        prev = yesterday_avg(mk)
        if prev is not None:
            prev_norm = _normalize(prev, {
                "co2": (350, 2000),
                "uv_index": (0, 11),
                "dust_storm_index": (0, 5),
                "pm25": (0, 300),
                "pm10": (0, 600),
            }.get(mk, (0, 100))[0], {
                "co2": (350, 2000),
                "uv_index": (0, 11),
                "dust_storm_index": (0, 5),
                "pm25": (0, 300),
                "pm10": (0, 600),
            }.get(mk, (0, 100))[1], True)
            prev_aqi_scores.append(prev_norm)
    aqi_prev = sum(prev_aqi_scores) / len(prev_aqi_scores) if prev_aqi_scores else 50.0

    aqi_sparkline: list[float | None] = []
    aqi_hourly: list[float] = []
    for mk in aqi_components:
        sl = sparkline_24h(mk)
        if sl:
            if not aqi_hourly:
                aqi_hourly = [0.0] * len(sl)
                count = [0] * len(sl)
            for i, v in enumerate(sl):
                if v is not None:
                    aqi_hourly[i] += v
                    count[i] += 1
    if aqi_hourly:
        aqi_sparkline = [v / max(c, 1) for v, c in zip(aqi_hourly, [max(1, count[i]) for i in range(len(aqi_hourly))])]
    else:
        aqi_sparkline = []

    # Heat Stress: temperature + humidity
    temp_today = today_avg("temperature")
    hum_today = today_avg("humidity")
    if temp_today is not None and hum_today is not None:
        heat_idx = -8.78469475556 + 1.61139411 * temp_today + 2.33854883889 * hum_today + -0.14611605 * temp_today * hum_today + -0.012308094 * temp_today ** 2 + -0.0164248277778 * hum_today ** 2 + 0.002211732 * temp_today ** 2 * hum_today + 0.00072546 * temp_today * hum_today ** 2 + -3.582e-6 * temp_today ** 2 * hum_today ** 2
        heat_score = _normalize(heat_idx, 20, 60, invert=True)
    else:
        heat_score = 50.0

    temp_prev = yesterday_avg("temperature")
    hum_prev = yesterday_avg("humidity")
    if temp_prev is not None and hum_prev is not None:
        heat_prev_idx = -8.78469475556 + 1.61139411 * temp_prev + 2.33854883889 * hum_prev + -0.14611605 * temp_prev * hum_prev + -0.012308094 * temp_prev ** 2 + -0.0164248277778 * hum_prev ** 2 + 0.002211732 * temp_prev ** 2 * hum_prev + 0.00072546 * temp_prev * hum_prev ** 2 + -3.582e-6 * temp_prev ** 2 * hum_prev ** 2
        heat_prev = _normalize(heat_prev_idx, 20, 60, invert=True)
    else:
        heat_prev = 50.0

    temp_sparkline = sparkline_24h("temperature")
    hum_sparkline = sparkline_24h("humidity")
    heat_sparkline: list[float | None] = []
    if temp_sparkline and hum_sparkline:
        heat_sparkline = [
            _normalize(
                -8.78469475556 + 1.61139411 * (t or 25) + 2.33854883889 * (h or 50) + -0.14611605 * (t or 25) * (h or 50) + -0.012308094 * (t or 25) ** 2 + -0.0164248277778 * (h or 50) ** 2 + 0.002211732 * (t or 25) ** 2 * (h or 50) + 0.00072546 * (t or 25) * (h or 50) ** 2 + -3.582e-6 * (t or 25) ** 2 * (h or 50) ** 2,
                20, 60, invert=True
            )
            for t, h in zip(temp_sparkline, hum_sparkline)
        ]

    # Livability: average of all normalized scores
    all_normalized: list[float] = []
    all_normalized.append(normalized_score("temperature", 15, 50, invert=True))
    all_normalized.append(normalized_score("humidity", 20, 90, invert=True))
    all_normalized.append(normalized_score("co2", 350, 2000, invert=True))
    all_normalized.append(normalized_score("noise", 20, 100, invert=True))
    all_normalized.append(normalized_score("uv_index", 0, 11, invert=True))
    all_normalized.append(normalized_score("traffic_density", 0, 200, invert=True))
    all_normalized.append(normalized_score("dust_storm_index", 0, 5, invert=True))
    livability_score = sum(all_normalized) / len(all_normalized) if all_normalized else 50.0

    prev_livability: list[float] = []
    for mk in ["temperature", "humidity", "co2", "noise", "uv_index", "traffic_density", "dust_storm_index"]:
        prev = yesterday_avg(mk)
        if prev is not None:
            mn, mx = {"temperature": (15, 50), "humidity": (20, 90), "co2": (350, 2000), "noise": (20, 100), "uv_index": (0, 11), "traffic_density": (0, 200), "dust_storm_index": (0, 5)}.get(mk, (0, 100))
            prev_livability.append(_normalize(prev, mn, mx, invert=True))
    livability_prev = sum(prev_livability) / len(prev_livability) if prev_livability else 50.0

    livability_sparkline: list[float | None] = []
    livability_hourly: list[float] = []
    for mk in ["temperature", "humidity", "co2", "noise", "uv_index", "traffic_density", "dust_storm_index"]:
        sl = sparkline_24h(mk)
        if sl and len(sl) > 0:
            if not livability_hourly:
                livability_hourly = [0.0] * len(sl)
                count = [0] * len(sl)
            mn, mx = {"temperature": (15, 50), "humidity": (20, 90), "co2": (350, 2000), "noise": (20, 100), "uv_index": (0, 11), "traffic_density": (0, 200), "dust_storm_index": (0, 5)}.get(mk, (0, 100))
            for i, v in enumerate(sl):
                if v is not None:
                    livability_hourly[i] += _normalize(v, mn, mx, invert=True)
                    count[i] += 1
    if livability_hourly:
        livability_sparkline = [v / max(c, 1) for v, c in zip(livability_hourly, [max(1, count[i]) for i in range(len(livability_hourly))])]

    result = {
        "aqi": {
            "name": "Air Quality Index",
            "score": round(aqi_total, 1),
            "previous_score": round(aqi_prev, 1),
            "trend": _trend(aqi_total, aqi_prev),
            "status": _status_good_moderate_critical(aqi_total),
            "sparkline": [round(v, 1) if v is not None else None for v in aqi_sparkline],
        },
        "heat_stress": {
            "name": "Heat Stress Index",
            "score": round(heat_score, 1),
            "previous_score": round(heat_prev, 1),
            "trend": _trend(heat_score, heat_prev),
            "status": _status_good_moderate_critical(heat_score),
            "sparkline": [round(v, 1) if v is not None else None for v in heat_sparkline],
        },
        "livability": {
            "name": "Urban Livability",
            "score": round(livability_score, 1),
            "previous_score": round(livability_prev, 1),
            "trend": _trend(livability_score, livability_prev),
            "status": _status_good_moderate_critical(livability_score),
            "sparkline": [round(v, 1) if v is not None else None for v in livability_sparkline],
        },
        "updated_at": now.isoformat(),
    }

    if redis_manager.client:
        await redis_manager.client.set(CITY_HEALTH_CACHE_KEY, json.dumps(result, default=str), ex=CITY_HEALTH_CACHE_TTL)

    return result


@app.get("/api/v1/city-stats")
async def city_stats(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select, func
    from smart_city_database.models import Sensor, Alert
    sensor_count = await db.scalar(select(func.count(Sensor.id)).where(Sensor.status == "active"))
    alert_count = await db.scalar(select(func.count(Alert.id)).where(Alert.acknowledged == False))
    return {"sensor_count": sensor_count or 0, "alert_count": alert_count or 0}
