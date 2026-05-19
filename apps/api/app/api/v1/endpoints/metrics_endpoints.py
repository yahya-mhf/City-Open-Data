import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.schemas import MetricDefinitionCreate, MetricDefinitionRead, MetricDefinitionUpdate

from ....core.dependencies import get_db, require_admin

router = APIRouter()


@router.post("", response_model=MetricDefinitionRead, status_code=status.HTTP_201_CREATED)
async def create_metric(
    body: MetricDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(models.MetricDefinition).where(models.MetricDefinition.key == body.key))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Metric key already exists")

    metric = models.MetricDefinition(**body.model_dump())
    db.add(metric)
    await db.flush()
    await db.refresh(metric)
    return metric


@router.get("", response_model=list[MetricDefinitionRead])
async def list_metrics(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    query = select(models.MetricDefinition).order_by(models.MetricDefinition.display_name)
    if active_only:
        query = query.where(models.MetricDefinition.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{metric_id}", response_model=MetricDefinitionRead)
async def get_metric(
    metric_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(models.MetricDefinition).where(models.MetricDefinition.id == metric_id))
    metric = result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric not found")
    return metric


@router.patch("/{metric_id}", response_model=MetricDefinitionRead)
async def update_metric(
    metric_id: uuid.UUID,
    body: MetricDefinitionUpdate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(models.MetricDefinition).where(models.MetricDefinition.id == metric_id))
    metric = result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(metric, field, value)

    await db.flush()
    await db.refresh(metric)
    return metric


@router.delete("/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric(
    metric_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(models.MetricDefinition).where(models.MetricDefinition.id == metric_id))
    metric = result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric not found")
    await db.delete(metric)
    await db.flush()
