import hashlib
import logging
import time
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database.models import ApiKey, ApiKeyUsage
from smart_city_shared.constants import API_KEY_TIERS, API_KEY_RATE_LIMIT_PREFIX

from ..core.dependencies import get_db
from ..core.redis_client import redis_manager

logger = logging.getLogger("smart_city.api_key_auth")


async def verify_api_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    api_key_header = request.headers.get("X-API-Key")
    if not api_key_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header required",
        )

    key_hash = hashlib.sha256(api_key_header.encode()).hexdigest()
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_hash == key_hash,
            ApiKey.is_active == True,
        )
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
        )

    if api_key.expires_at and api_key.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has expired",
        )

    tier_config = API_KEY_TIERS.get(api_key.tier, API_KEY_TIERS["free"])
    rate_limit = api_key.rate_limit if api_key.rate_limit else tier_config["rate_limit"]

    if redis_manager.client:
        minute_bucket = int(time.time()) // 60
        rate_key = API_KEY_RATE_LIMIT_PREFIX.format(api_key.id, minute_bucket)
        count = await redis_manager.client.incr(rate_key)
        if count == 1:
            await redis_manager.client.expire(rate_key, 60)
        if count > rate_limit:
            logger.warning("API key rate limit exceeded", extra={"api_key_id": str(api_key.id)})
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {rate_limit} requests per minute.",
            )

    if api_key.allowed_endpoints:
        path = request.url.path
        method = request.method
        allowed = False
        for pattern in api_key.allowed_endpoints:
            if path.startswith(pattern) or path == pattern:
                allowed = True
                break
            if "*" in pattern:
                import fnmatch
                if fnmatch.fnmatch(path, pattern):
                    allowed = True
                    break
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Endpoint {method} {path} not allowed for this API key",
            )

    api_key.last_used_at = datetime.now(timezone.utc)
    api_key.total_requests += 1

    usage_log = ApiKeyUsage(
        api_key_id=api_key.id,
        endpoint=request.url.path,
        method=request.method,
        status_code=200,
        response_time_ms=None,
        ip_address=request.client.host if request.client else None,
    )
    db.add(usage_log)

    return {
        "api_key_id": api_key.id,
        "user_id": api_key.user_id,
        "tier": api_key.tier,
        "plan": api_key.tier,
        "allowed_metrics": api_key.allowed_metrics,
        "history_days": tier_config["history_days"],
        "max_metrics": tier_config["max_metrics"],
    }
