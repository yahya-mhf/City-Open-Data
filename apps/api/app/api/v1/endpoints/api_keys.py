import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database.models import ApiKey
from smart_city_shared.schemas import ApiKeyCreate, ApiKeyRead, ApiKeyGenerated

from ....core.dependencies import get_db, get_current_user

router = APIRouter()


def generate_api_key() -> str:
    return f"sc_{secrets.token_urlsafe(32)}"


@router.post("/api-keys", response_model=ApiKeyGenerated, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    raw_key = generate_api_key()
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    api_key = ApiKey(
        user_id=current_user["id"],
        key_hash=key_hash,
        name=body.name,
        rate_limit=body.rate_limit,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)

    return ApiKeyGenerated(
        id=api_key.id,
        name=api_key.name,
        key=raw_key,
        rate_limit=api_key.rate_limit,
        created_at=api_key.created_at,
    )


@router.get("/api-keys", response_model=list[ApiKeyRead])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.user_id == current_user["id"],
            ApiKey.is_active == True,
        ).order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return [
        ApiKeyRead(
            id=k.id,
            name=k.name,
            key_prefix=k.key_hash[:8] + "...",
            rate_limit=k.rate_limit,
            is_active=k.is_active,
            created_at=k.created_at,
        )
        for k in keys
    ]


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from uuid import UUID
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == UUID(key_id),
            ApiKey.user_id == current_user["id"],
        )
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )
    key.is_active = False
    await db.flush()
