import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import aio_pika
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from smart_city_database.models import MetricDefinition, Sensor, SensorReading
from smart_city_database.session import Base
from smart_city_observability import setup_logging
from smart_city_observability.metrics import metrics
from smart_city_shared.config import settings
from smart_city_shared.constants import (
    ALERTS_QUEUE,
    REDIS_LATEST_PREFIX,
    ROUTING_KEY_ALERT,
    ROUTING_KEY_RAW,
    SENSOR_DATA_EXCHANGE,
    SENSOR_DEAD_LETTER_QUEUE,
    SENSOR_INGESTION_QUEUE,
)
from smart_city_shared.schemas import HubPayload
from smart_city_shared.utils import utc_now

setup_logging()
logger = logging.getLogger(__name__)

engine = create_async_engine(settings.DATABASE_URL, pool_size=10)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

redis_client: aioredis.Redis | None = None


async def ensure_rabbitmq_setup(channel: aio_pika.RobustChannel) -> None:
    exchange = await channel.declare_exchange(
        SENSOR_DATA_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )
    queue = await channel.declare_queue(SENSOR_INGESTION_QUEUE, durable=True)
    await queue.bind(exchange, routing_key=ROUTING_KEY_RAW)

    dlq = await channel.declare_queue(SENSOR_DEAD_LETTER_QUEUE, durable=True)
    await dlq.bind(exchange, routing_key="sensor.invalid")

    alert_queue = await channel.declare_queue(ALERTS_QUEUE, durable=True)
    await alert_queue.bind(exchange, routing_key=ROUTING_KEY_ALERT)


async def validate_and_store(session: AsyncSession, payload: HubPayload) -> dict[str, Any]:
    metric_defs: dict[str, MetricDefinition] = {}
    result = await session.execute(
        select(MetricDefinition).where(MetricDefinition.is_active == True)
    )
    for md in result.scalars().all():
        metric_defs[md.key] = md

    sensor_cache: dict[str, Sensor] = {}
    stored_count = 0

    for reading in payload.sensor_readings:
        sid = reading.sensor_id
        if sid not in sensor_cache:
            result = await session.execute(
                select(Sensor).where(Sensor.id == sid)
            )
            sensor = result.scalar_one_or_none()
            if not sensor:
                sensor = Sensor(id=sid, name=f"Sensor {sid}", latitude=31.6295, longitude=-7.9811)
                session.add(sensor)
                await session.flush()
            sensor_cache[sid] = sensor

        latest_metrics: dict[str, float | int | str | bool] = {}

        for metric_key, metric_value in reading.metrics.items():
            md = metric_defs.get(metric_key)
            if not md:
                logger.warning("Unknown metric key: %s, skipping", metric_key)
                continue

            value_numeric = None
            value_text = None
            if isinstance(metric_value, (int, float)):
                value_numeric = float(metric_value)
                latest_metrics[metric_key] = metric_value

                thresholds = md.thresholds_json or {}
                if thresholds:
                    await check_thresholds(session, md, sid, metric_key, metric_value, thresholds)

                if metric_key == "seismic" and isinstance(metric_value, (int, float)) and float(metric_value) > 2.5:
                    if redis_client:
                        import json as _json
                        await redis_client.publish("seismic_events", _json.dumps({
                            "type": "seismic_event",
                            "sensor_id": sid,
                            "value": float(metric_value),
                            "timestamp": reading.timestamp.isoformat() if reading.timestamp else utc_now().isoformat(),
                        }))
            elif isinstance(metric_value, str):
                value_text = metric_value
                latest_metrics[metric_key] = metric_value
            elif isinstance(metric_value, bool):
                value_numeric = float(metric_value)
                latest_metrics[metric_key] = metric_value

            sr = SensorReading(
                time=reading.timestamp or utc_now(),
                sensor_id=sensor_cache[sid].id,
                metric_id=md.id,
                value_numeric=value_numeric,
                value_text=value_text,
                battery_level=reading.battery,
                quality_flag="good",
            )
            session.add(sr)
            stored_count += 1

        if latest_metrics:
            await update_redis_latest(sid, reading.timestamp or utc_now(), latest_metrics, reading.battery)

    return {"stored": stored_count, "hub_id": payload.hub_id}


async def check_thresholds(
    session: AsyncSession,
    md: MetricDefinition,
    sensor_id: str,
    metric_key: str,
    value: float | int | str | bool,
    thresholds: dict[str, Any],
) -> None:
    if not isinstance(value, (int, float)):
        return

    from smart_city_database.models import Alert

    for level, threshold in thresholds.items():
        try:
            threshold_val = float(threshold)
        except (ValueError, TypeError):
            continue

        if value > threshold_val:
            severity = level
            if "critical" in level:
                severity = "critical"
            elif "high" in level:
                severity = "high"
            elif "medium" in level:
                severity = "medium"
            else:
                severity = "medium"

            alert = Alert(
                sensor_id=sensor_id,
                severity=severity,
                message=f"{md.display_name} exceeded {level} threshold: {value} > {threshold_val} {md.unit}",
            )
            session.add(alert)


async def update_redis_latest(
    sensor_id: str,
    timestamp: datetime,
    metrics: dict[str, float | int | str | bool],
    battery: float | None,
) -> None:
    if not redis_client:
        return

    key = REDIS_LATEST_PREFIX.format(sensor_id)
    data = {
        "timestamp": timestamp.isoformat(),
        "metrics": metrics,
        "battery": battery,
    }
    await redis_client.set(key, json.dumps(data, default=str))


async def process_message(message: aio_pika.IncomingMessage) -> None:
    async with message.process():
        try:
            body = json.loads(message.body.decode())
            payload = HubPayload(**body)
        except (json.JSONDecodeError, ValueError) as e:
            logger.error("Invalid message: %s", e)
            metrics.messages_processed.labels(queue=SENSOR_INGESTION_QUEUE, status="invalid").inc()
            return

        async with SessionLocal() as session:
            try:
                result = await validate_and_store(session, payload)
                await session.commit()
                metrics.messages_processed.labels(
                    queue=SENSOR_INGESTION_QUEUE, status="success"
                ).inc()
                logger.info("Processed %d readings from hub %s", result["stored"], result["hub_id"])
            except Exception:
                await session.rollback()
                logger.exception("Failed to process message")
                metrics.messages_processed.labels(
                    queue=SENSOR_INGESTION_QUEUE, status="error"
                ).inc()
                metrics.errors_total.labels(service="worker", error_type="processing").inc()


async def main() -> None:
    global redis_client

    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

    async with await aio_pika.connect_robust(settings.RABBITMQ_URL) as connection:
        channel = await connection.channel()
        await ensure_rabbitmq_setup(channel)

        await channel.set_qos(prefetch_count=10)

        queue = await channel.declare_queue(SENSOR_INGESTION_QUEUE, durable=True)

        logger.info("Worker started. Waiting for messages...")

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                await process_message(message)


if __name__ == "__main__":
    asyncio.run(main())
