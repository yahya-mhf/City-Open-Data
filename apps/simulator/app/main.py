import asyncio
import logging
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone

from smart_city_shared.config import settings

from .generator import SensorState, generate_readings
from .publisher import RabbitMQPublisher

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("simulator")

INTERVAL = int(os.getenv("SIMULATOR_INTERVAL_SECONDS", "5"))
SENSOR_COUNT = int(os.getenv("SIMULATOR_SENSOR_COUNT", "20"))
BATCH_SIZE = int(os.getenv("SIMULATOR_BATCH_SIZE", "10"))
REALISTIC_TIME = os.getenv("SIMULATOR_REALISTIC_TIME", "true").lower() == "true"

HUB_IDS = ["hub-001", "hub-002", "hub-003"]

HUB_COORDS: dict[str, tuple[float, float]] = {
    "hub-001": (31.630, -7.982),
    "hub-002": (31.632, -8.015),
    "hub-003": (31.610, -8.048),
}


def build_sensors() -> list[SensorState]:
    sensors: list[SensorState] = []
    for i in range(SENSOR_COUNT):
        hub_id = HUB_IDS[i % len(HUB_IDS)]
        sid = f"{hub_id}-sensor-{i + 1:03d}"
        base_lat, base_lon = HUB_COORDS[hub_id]
        lat = base_lat + random.uniform(-0.008, 0.008)
        lon = base_lon + random.uniform(-0.008, 0.008)
        s = SensorState(sensor_id=sid, hub_id=hub_id, latitude=lat, longitude=lon)
        s.temperature = 15.0 + (i % 5) * 3.0
        sensors.append(s)
    return sensors


async def run() -> None:
    publisher = RabbitMQPublisher(settings.RABBITMQ_URL)
    await publisher.connect()

    sensors = build_sensors()
    total_sent = 0
    start_time = time.monotonic()
    last_status_time = 0.0
    last_publish_time = 0.0
    shutdown = False

    loop = asyncio.get_running_loop()

    def _on_signal() -> None:
        nonlocal shutdown
        if shutdown:
            logger.warning("Forced exit")
            sys.exit(1)
        shutdown = True
        logger.info("Shutdown requested, finishing current batch...")

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _on_signal)
        except NotImplementedError:
            pass

    logger.info(
        "Simulator started: %d sensors, interval=%ds, batch=%d, realistic_time=%s",
        SENSOR_COUNT,
        INTERVAL,
        BATCH_SIZE,
        REALISTIC_TIME,
    )

    while not shutdown:
        try:
            batch_start = time.monotonic()

            readings = generate_readings(sensors, REALISTIC_TIME, INTERVAL)

            for i in range(0, len(readings), BATCH_SIZE):
                batch = readings[i : i + BATCH_SIZE]
                sent = await publisher.publish(batch)
                total_sent += sent

            last_publish_time = time.monotonic()

            elapsed = time.monotonic() - batch_start
            sleep_time = max(0, INTERVAL - elapsed)
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Publish failed: %s", e)
            await asyncio.sleep(5)

        now_ts = time.monotonic()
        if now_ts - last_status_time >= 30:
            last_status_time = now_ts
            uptime = now_ts - start_time
            uptime_str = f"{int(uptime // 3600):02d}:{int((uptime % 3600) // 60):02d}:{int(uptime % 60):02d}"
            since_publish = now_ts - last_publish_time
            logger.info(
                "Running | Sensors: %d | Messages sent: %s | Uptime: %s | Last publish: %.1fs ago | RabbitMQ: connected",
                SENSOR_COUNT,
                f"{total_sent:,}",
                uptime_str,
                since_publish,
            )

    logger.info("Shutdown complete. Total messages sent: %s", f"{total_sent:,}")
    await publisher.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
