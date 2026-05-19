from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_auth import JWTHandler
from smart_city_database import get_session
from smart_city_database.models import User, ApiKey, UsageLog
from smart_city_shared.enums import SubscriptionPlan

from .redis_client import redis_manager

security = HTTPBearer()
jwt_handler = JWTHandler()


async def get_db() -> AsyncGenerator[AsyncSession, Any]:
    async for session in get_session():
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payload = jwt_handler.decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "plan": user.plan,
        "full_name": user.full_name,
    }


async def require_admin(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    from smart_city_auth import RBACHelper

    if not RBACHelper.is_admin(current_user["role"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def require_operator(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    from smart_city_auth import RBACHelper

    if not RBACHelper.is_operator_or_above(current_user["role"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator or admin access required",
        )
    return current_user


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any] | None:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    try:
        token = auth_header.split(" ", 1)[1]
        payload = jwt_handler.decode_token(token)
        if not payload or payload.get("type") != "access":
            return None
        result = await db.execute(select(User).where(User.id == payload["sub"]))
        user = result.scalar_one_or_none()
        if not user:
            return None
        return {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "plan": user.plan,
            "full_name": user.full_name,
        }
    except Exception:
        return None


async def require_paid_user(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user["plan"] not in (SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Paid subscription required. Upgrade your plan to access this feature.",
        )
    return current_user


async def resolve_api_key_or_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    api_key_header = request.headers.get("X-API-Key")
    if api_key_header:
        import hashlib

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
                detail="Invalid API key",
            )
        result = await db.execute(select(User).where(User.id == api_key.user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key owner not found",
            )
        return {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "plan": user.plan,
            "full_name": user.full_name,
            "auth_method": "api_key",
            "api_key_id": api_key.id,
        }

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide JWT or API key.",
        )
    token = auth_header.split(" ", 1)[1]
    payload = jwt_handler.decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "plan": user.plan,
        "full_name": user.full_name,
        "auth_method": "jwt",
        "api_key_id": None,
    }


async def track_usage(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(resolve_api_key_or_user),
) -> dict[str, Any]:
    log = UsageLog(
        user_id=current_user["id"],
        api_key_id=current_user.get("api_key_id"),
        endpoint=request.url.path,
        cost_units=1,
    )
    db.add(log)
    return current_user
