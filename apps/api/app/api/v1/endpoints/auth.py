from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_auth import JWTHandler, PasswordHandler
from smart_city_database.models.user import User, RefreshToken
from smart_city_shared.schemas import UserCreate, UserLogin, TokenResponse, RefreshRequest, UserRead, CouponApply

from ....core.dependencies import get_db, jwt_handler, get_current_user
from smart_city_shared.enums import SubscriptionPlan

router = APIRouter()
password_handler = PasswordHandler()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        password_hash=password_handler.hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not password_handler.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = jwt_handler.create_access_token(user.id, user.role)
    refresh_token = jwt_handler.create_refresh_token(user.id)

    from smart_city_shared.utils import utc_now
    import hashlib

    rt = RefreshToken(
        user_id=user.id,
        token_hash=hashlib.sha256(refresh_token.encode()).hexdigest(),
        expires_at=jwt_handler.get_expires_at(),
    )
    db.add(rt)
    await db.flush()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    import hashlib
    from smart_city_shared.utils import utc_now

    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > utc_now(),
        )
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    rt.revoked_at = utc_now()

    payload = jwt_handler.decode_token(body.refresh_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_access = jwt_handler.create_access_token(user.id, user.role)
    new_refresh = jwt_handler.create_refresh_token(user.id)

    rt2 = RefreshToken(
        user_id=user.id,
        token_hash=hashlib.sha256(new_refresh.encode()).hexdigest(),
        expires_at=jwt_handler.get_expires_at(),
    )
    db.add(rt2)
    await db.flush()

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import hashlib
    from smart_city_shared.utils import utc_now

    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.user_id == current_user["id"],
        )
    )
    rt = result.scalar_one_or_none()
    if rt:
        rt.revoked_at = utc_now()
        await db.flush()
    return {"message": "Logged out"}


COUPON_CODES = {
    "SMARTCITY100": SubscriptionPlan.PRO,
}


@router.patch("/me/plan", response_model=UserRead)
async def apply_coupon(
    body: CouponApply,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.code not in COUPON_CODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid coupon code",
        )

    result = await db.execute(select(User).where(User.id == current_user["id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.plan = COUPON_CODES[body.code]
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserRead)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user["id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
