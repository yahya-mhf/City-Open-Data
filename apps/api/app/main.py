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


@app.get("/api/v1/city-stats")
async def city_stats(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select, func
    from smart_city_database.models import Sensor, Alert
    sensor_count = await db.scalar(select(func.count(Sensor.id)).where(Sensor.status == "active"))
    alert_count = await db.scalar(select(func.count(Alert.id)).where(Alert.acknowledged == False))
    return {"sensor_count": sensor_count or 0, "alert_count": alert_count or 0}
