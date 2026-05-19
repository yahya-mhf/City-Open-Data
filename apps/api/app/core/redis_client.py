import json
from typing import Any

import redis.asyncio as aioredis

from smart_city_shared.config import settings
from smart_city_shared.constants import REDIS_LATEST_PREFIX


class RedisManager:
    def __init__(self) -> None:
        self.client: aioredis.Redis | None = None

    async def connect(self) -> None:
        self.client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()

    async def set_latest_reading(self, sensor_id: str, data: dict[str, Any]) -> None:
        if not self.client:
            return
        key = REDIS_LATEST_PREFIX.format(sensor_id)
        await self.client.set(key, json.dumps(data, default=str))

    async def get_latest_reading(self, sensor_id: str) -> dict[str, Any] | None:
        if not self.client:
            return None
        key = REDIS_LATEST_PREFIX.format(sensor_id)
        data = await self.client.get(key)
        if data:
            return json.loads(data)
        return None

    async def get_all_latest_readings(self, sensor_ids: list[str]) -> dict[str, dict[str, Any] | None]:
        if not self.client:
            return {}
        keys = [REDIS_LATEST_PREFIX.format(sid) for sid in sensor_ids]
        values = await self.client.mget(keys)
        result: dict[str, dict[str, Any] | None] = {}
        for sid, val in zip(sensor_ids, values):
            if val:
                result[sid] = json.loads(val)
            else:
                result[sid] = None
        return result


redis_manager = RedisManager()
