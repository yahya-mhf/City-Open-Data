import uuid
from datetime import datetime, timedelta, timezone

import jwt

from smart_city_shared.config import settings


class JWTHandler:
    def __init__(self) -> None:
        self.secret = settings.JWT_SECRET
        self.algorithm = "HS256"
        self.access_expire_minutes = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        self.refresh_expire_days = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS

    def create_access_token(self, user_id: uuid.UUID, role: str) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user_id),
            "role": role,
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=self.access_expire_minutes),
        }
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)

    def create_refresh_token(self, user_id: uuid.UUID) -> str:
        now = datetime.now(timezone.utc)
        jti = str(uuid.uuid4())
        payload = {
            "sub": str(user_id),
            "type": "refresh",
            "jti": jti,
            "iat": now,
            "exp": now + timedelta(days=self.refresh_expire_days),
        }
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)

    def decode_token(self, token: str) -> dict | None:
        try:
            payload = jwt.decode(token, self.secret, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    def get_expires_at(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(days=self.refresh_expire_days)
