from fastapi import APIRouter

from .endpoints import auth, sensors, alerts, reports, admin, metrics_endpoints, map_endpoints
from .endpoints import analytics, api_keys, export as export_endpoints

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(sensors.router, prefix="/sensors", tags=["Sensors"])
router.include_router(alerts.router, prefix="/alerts", tags=["Alerts"])
router.include_router(reports.router, prefix="/reports", tags=["Reports"])
router.include_router(admin.router, prefix="/admin", tags=["Admin"])
router.include_router(metrics_endpoints.router, prefix="/metrics", tags=["Metrics"])
router.include_router(map_endpoints.router, prefix="/map", tags=["Map"])
router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
router.include_router(api_keys.router, prefix="/developer", tags=["Developer"])
router.include_router(export_endpoints.router, prefix="/export", tags=["Export"])
