from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database.models import ApiKey, ApiKeyUsage
from smart_city_shared.constants import API_KEY_TIERS
from smart_city_shared.schemas import (
    ApiKeyCreate,
    ApiKeyRead,
    ApiKeyGenerated,
    ApiKeyUpdate,
    ApiKeyUsageStats,
)

from ....core.dependencies import get_db, get_current_user, require_admin
from ....services.api_keys import generate_api_key

router = APIRouter()


@router.post("/keys", response_model=ApiKeyGenerated, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    full_key, prefix, key_hash = generate_api_key()

    tier_config = API_KEY_TIERS.get(body.tier)
    if not tier_config:
        raise HTTPException(status_code=400, detail=f"Invalid tier '{body.tier}'. Valid: {list(API_KEY_TIERS.keys())}")

    rate_limit = body.rate_limit or tier_config["rate_limit"]

    api_key = ApiKey(
        user_id=current_user["id"],
        key_hash=key_hash,
        key_prefix=prefix,
        name=body.name,
        description=body.description,
        tier=body.tier,
        rate_limit=rate_limit,
        allowed_metrics=body.allowed_metrics,
        allowed_endpoints=body.allowed_endpoints,
        expires_at=body.expires_at,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)

    return ApiKeyGenerated(
        id=api_key.id,
        name=api_key.name,
        description=api_key.description,
        key=full_key,
        tier=api_key.tier,
        rate_limit=api_key.rate_limit,
        created_at=api_key.created_at,
    )


@router.get("/keys", response_model=list[ApiKeyRead])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == current_user["id"])
        .order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return [
        ApiKeyRead(
            id=k.id,
            name=k.name,
            description=k.description,
            key_prefix=k.key_prefix,
            tier=k.tier,
            rate_limit=k.rate_limit,
            is_active=k.is_active,
            allowed_metrics=k.allowed_metrics,
            allowed_endpoints=k.allowed_endpoints,
            created_at=k.created_at,
            last_used_at=k.last_used_at,
            expires_at=k.expires_at,
            total_requests=k.total_requests,
        )
        for k in keys
    ]


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.user_id == current_user["id"],
        )
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    key.is_active = False
    await db.flush()


@router.get("/keys/{key_id}/usage", response_model=ApiKeyUsageStats)
async def get_api_key_usage(
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.user_id == current_user["id"],
        )
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    today_count = await db.execute(
        select(func.count(ApiKeyUsage.id)).where(
            ApiKeyUsage.api_key_id == key_id,
            ApiKeyUsage.requested_at >= today_start,
        )
    )
    week_count = await db.execute(
        select(func.count(ApiKeyUsage.id)).where(
            ApiKeyUsage.api_key_id == key_id,
            ApiKeyUsage.requested_at >= week_start,
        )
    )

    by_endpoint_result = await db.execute(
        select(ApiKeyUsage.endpoint, func.count(ApiKeyUsage.id).label("cnt"))
        .where(
            ApiKeyUsage.api_key_id == key_id,
            ApiKeyUsage.requested_at >= week_start,
        )
        .group_by(ApiKeyUsage.endpoint)
    )
    by_endpoint = {row.endpoint: row.cnt for row in by_endpoint_result}

    stats_result = await db.execute(
        select(
            func.avg(ApiKeyUsage.response_time_ms).label("avg_ms"),
            func.sum(
                func.cast(ApiKeyUsage.status_code >= 500, func.Integer())
            ).label("errors"),
            func.count(ApiKeyUsage.id).label("total"),
        ).where(
            ApiKeyUsage.api_key_id == key_id,
            ApiKeyUsage.requested_at >= week_start,
        )
    )
    stats = stats_result.one()
    total = stats.total or 1
    error_rate = (stats.errors or 0) / total

    return ApiKeyUsageStats(
        requests_today=today_count.scalar() or 0,
        requests_this_week=week_count.scalar() or 0,
        by_endpoint=by_endpoint,
        avg_response_time_ms=float(stats.avg_ms) if stats.avg_ms else None,
        error_rate=float(error_rate),
    )


@router.patch("/keys/{key_id}")
async def update_api_key(
    key_id: UUID,
    body: ApiKeyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    if body.tier is not None:
        if body.tier not in API_KEY_TIERS:
            raise HTTPException(status_code=400, detail=f"Invalid tier '{body.tier}'")
        key.tier = body.tier
        key.rate_limit = body.rate_limit or API_KEY_TIERS[body.tier]["rate_limit"]
    if body.rate_limit is not None:
        key.rate_limit = body.rate_limit
    if body.is_active is not None:
        key.is_active = body.is_active
    if body.allowed_metrics is not None:
        key.allowed_metrics = body.allowed_metrics
    if body.allowed_endpoints is not None:
        key.allowed_endpoints = body.allowed_endpoints
    if body.expires_at is not None:
        key.expires_at = body.expires_at

    await db.flush()
    return {"status": "updated"}
