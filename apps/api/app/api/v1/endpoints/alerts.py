import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.schemas import AlertRead

from ....core.dependencies import get_db, get_current_user

router = APIRouter()


@router.get("", response_model=list[AlertRead])
async def list_alerts(
    acknowledged: bool | None = None,
    sensor_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = select(models.Alert).order_by(models.Alert.created_at.desc())
    if acknowledged is not None:
        query = query.where(models.Alert.acknowledged == acknowledged)
    if sensor_id:
        query = query.where(models.Alert.sensor_id == sensor_id)
    query = query.limit(100)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{alert_id}/acknowledge", response_model=AlertRead)
async def acknowledge_alert(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from smart_city_auth import RBACHelper

    if not RBACHelper.can_manage_alerts(current_user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    result = await db.execute(select(models.Alert).where(models.Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    alert.acknowledged = True
    await db.flush()
    await db.refresh(alert)
    return alert
