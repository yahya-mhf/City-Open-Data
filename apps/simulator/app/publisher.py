import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

import aio_pika

from smart_city_shared.constants import SENSOR_DATA_EXCHANGE, ROUTING_KEY_RAW
from smart_city_shared.utils import utc_now

logger = logging.getLogger(__name__)


def _extract_hub_id(sensor_id: str) -> str:
    parts = sensor_id.rsplit("-sensor-", 1)
    return parts[0] if len(parts) == 2 else "unknown-hub"


class RabbitMQPublisher:
    def __init__(self, url: str) -> None:
        self._url = url
        self._connection: aio_pika.RobustConnection | None = None
        self._channel: aio_pika.Channel | None = None
        self._exchange: aio_pika.Exchange | None = None
        self._closed = False

    async def connect(self) -> None:
        if self._connection and not self._connection.is_closed:
            return
        self._connection = await aio_pika.connect_robust(self._url)
        self._channel = await self._connection.channel()
        self._exchange = await self._channel.declare_exchange(
            SENSOR_DATA_EXCHANGE,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        logger.info("Connected to RabbitMQ")

    async def publish(self, readings: list[dict[str, Any]]) -> int:
        if self._closed:
            return 0
        for _ in range(3):
            try:
                if not self._connection or self._connection.is_closed:
                    await self.connect()
                break
            except Exception:
                await asyncio.sleep(2)
        else:
            raise RuntimeError("Could not connect to RabbitMQ after 3 retries")

        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in readings:
            grouped[_extract_hub_id(r["sensor_id"])].append(r)

        total = 0
        for hub_id, hub_readings in grouped.items():
            payload = {
                "hub_id": hub_id,
                "sent_at": utc_now().isoformat(),
                "sensor_readings": hub_readings,
            }

            message = aio_pika.Message(
                body=json.dumps(payload).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                content_type="application/json",
            )

            if not self._exchange:
                raise RuntimeError("Exchange not declared")
            await self._exchange.publish(message, routing_key=ROUTING_KEY_RAW)
            total += len(hub_readings)

        return total

    async def close(self) -> None:
        self._closed = True
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
