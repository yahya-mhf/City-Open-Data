from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_auth import PasswordHandler
from smart_city_database import models
from smart_city_shared.schemas import SensorCreate, SensorRead, UserCreate, UserRead, HubCreate, HubRead

from ....core.dependencies import get_db, require_admin

router = APIRouter()
password_handler = PasswordHandler()


@router.get("/users", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(models.User).order_by(models.User.created_at.desc()))
    return result.scalars().all()


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(models.User).where(models.User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    user = models.User(
        email=body.email,
        password_hash=password_handler.hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/sensors", response_model=list[SensorRead])
async def list_sensors(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(models.Sensor).order_by(models.Sensor.name))
    return result.scalars().all()


@router.post("/sensors", response_model=SensorRead, status_code=status.HTTP_201_CREATED)
async def create_sensor(
    body: SensorCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    sensor = models.Sensor(**body.model_dump())
    db.add(sensor)
    await db.flush()
    await db.refresh(sensor)
    return sensor


@router.delete("/sensors/{sensor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sensor(
    sensor_id: str,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(models.Sensor).where(models.Sensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sensor not found")
    await db.delete(sensor)
    await db.flush()


@router.get("/hubs", response_model=list[HubRead])
async def list_hubs(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(models.Hub).order_by(models.Hub.name))
    return result.scalars().all()


@router.post("/hubs", response_model=HubRead, status_code=status.HTTP_201_CREATED)
async def create_hub(
    body: HubCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    hub = models.Hub(**body.model_dump())
    db.add(hub)
    await db.flush()
    await db.refresh(hub)
    return hub
