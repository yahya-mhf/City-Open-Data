import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from smart_city_shared.config import settings
from smart_city_observability import setup_logging

from .api.v1.routes import router as v1_router
from .core.redis_client import redis_manager
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
    title="Smart City Monitoring API",
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
app.include_router(websocket_router)

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/ready")
async def ready():
    return {"status": "ready"}
