#!/usr/bin/env python3
"""Seed 90 days of synthetic historical sensor readings into TimescaleDB."""

import argparse
import asyncio
import math
import os
import random
import sys
from datetime import datetime, timedelta, timezone

import asyncpg

INTERVAL_MINUTES = 10
BATCH_SIZE = 100000

_METRIC_META: dict[str, dict] = {
    "temperature": {"mean": 24.0, "std": 6.0, "min": -5, "max": 50},
    "humidity": {"mean": 55.0, "std": 15.0, "min": 10, "max": 100},
    "co2": {"mean": 450.0, "std": 80.0, "min": 350, "max": 2000},
    "pressure": {"mean": 1013.0, "std": 8.0, "min": 980, "max": 1050},
    "pm25": {"mean": 25.0, "std": 15.0, "min": 0, "max": 500},
    "pm10": {"mean": 45.0, "std": 25.0, "min": 0, "max": 1000},
    "noise": {"mean": 55.0, "std": 12.0, "min": 20, "max": 120},
    "water_level": {"mean": 2.5, "std": 1.5, "min": 0, "max": 10},
    "uv_index": {"mean": 5.0, "std": 3.0, "min": 0, "max": 14},
    "traffic_density": {"mean": 40.0, "std": 25.0, "min": 0, "max": 200},
    "energy_grid_load": {"mean": 2000.0, "std": 500.0, "min": 0, "max": 5000},
    "dust_storm_index": {"mean": 0.5, "std": 1.0, "min": 0, "max": 5},
}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _diurnal_temp(hour: float) -> float:
    if 5 <= hour <= 14:
        return -4.0 * math.cos(math.pi * (hour - 5) / 9)
    elif 14 < hour <= 23:
        return 4.0 * math.cos(math.pi * (hour - 23) / 9)
    return -4.0


def _diurnal_co2(hour: float) -> float:
    if 7 <= hour <= 9:
        return 120.0 * math.sin(math.pi * (hour - 7) / 2)
    elif 17 <= hour <= 19:
        return 120.0 * math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_pm(hour: float) -> float:
    if 7 <= hour <= 9:
        return 30.0 * math.sin(math.pi * (hour - 7) / 2)
    elif 17 <= hour <= 19:
        return 30.0 * math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_noise(hour: float) -> float:
    if 7 <= hour <= 9:
        return 15.0 * math.sin(math.pi * (hour - 7) / 2)
    elif 12 <= hour <= 14:
        return -5.0 * math.sin(math.pi * (hour - 12) / 2)
    elif 17 <= hour <= 19:
        return 15.0 * math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_water(hour: float) -> float:
    return -0.3 * math.cos(2 * math.pi * (hour - 14) / 24)


def _diurnal_uv(hour: float) -> float:
    if 6 <= hour <= 18:
        return 6.0 * math.sin(math.pi * (hour - 6) / 12)
    return 0.0


def _diurnal_traffic(hour: float) -> float:
    if 7 <= hour <= 9:
        return 60.0 * math.sin(math.pi * (hour - 7) / 2)
    if 17 <= hour <= 19:
        return 60.0 * math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_load(hour: float) -> float:
    if 8 <= hour <= 12:
        return 400.0 * math.sin(math.pi * (hour - 8) / 4)
    if 14 <= hour <= 17:
        return 300.0 * math.sin(math.pi * (hour - 14) / 3)
    return 0.0


def _dust_spike(hour: float, temp: float, humid: float) -> float:
    if temp < 30 or humid > 30:
        return 0.0
    if 12 <= hour <= 17:
        intensity = (temp - 30) / 20 * (1 - humid / 100) * (1 - abs(hour - 14.5) / 2.5)
        return max(0.0, intensity)
    return 0.0


def _diurnal_humidity(hour: float, temp: float) -> float:
    base = 70.0 - (temp - 15.0) * 0.8
    return _clamp(base + random.gauss(0, 3), 10, 100)


def _seasonal(day_of_year: int) -> float:
    return 8.0 * math.sin(2 * math.pi * (day_of_year - 80) / 365)


def _build_anomalies(
    sensor_ids: list[str],
    metric_keys: list[str],
    start: datetime,
    end: datetime,
) -> dict[tuple[str, str], list[tuple[datetime, datetime, float]]]:
    random.seed(42)
    total_days = (end - start).days
    total_months = max(1, total_days // 30)
    out: dict[tuple[str, str], list[tuple[datetime, datetime, float]]] = {}
    for sid in sensor_ids:
        for mk in metric_keys:
            events: list[tuple[datetime, datetime, float]] = []
            for m in range(total_months):
                n = random.randint(3, 5)
                month_start = start + timedelta(days=m * 30)
                month_end = min(month_start + timedelta(days=30), end)
                span = (month_end - month_start).total_seconds()
                for _ in range(n):
                    offset = random.uniform(0, span)
                    dur = random.uniform(3600, 14400)
                    ev_start = month_start + timedelta(seconds=offset)
                    ev_end = ev_start + timedelta(seconds=dur)
                    if ev_end > end:
                        ev_end = end
                    mult = random.choice([-3, -2.5, -2, 2, 2.5, 3])
                    events.append((ev_start, ev_end, mult))
            if events:
                out[(sid, mk)] = events
    return out


def _anomaly_multiplier(
    dt: datetime,
    sid: str,
    mk: str,
    anomalies: dict[tuple[str, str], list[tuple[datetime, datetime, float]]],
) -> float:
    evs = anomalies.get((sid, mk))
    if not evs:
        return 1.0
    for ev_start, ev_end, mult in evs:
        if ev_start <= dt <= ev_end:
            return 1.0 + mult * 0.15
    return 1.0


async def run(days: int) -> None:
    raw_url = os.environ.get("DATABASE_URL")
    if not raw_url:
        print("FATAL: DATABASE_URL environment variable is not set")
        sys.exit(1)
    pg_url = raw_url.replace("postgresql+asyncpg://", "postgresql://")

    print(f"Connecting ...")
    conn = await asyncpg.connect(pg_url)
    print("Connected.")

    try:
        metric_rows = await conn.fetch(
            "SELECT id, key FROM metric_definitions WHERE is_active = true"
        )
        metric_ids = {r["key"]: r["id"] for r in metric_rows}
        missing = [k for k in _METRIC_META if k not in metric_ids]
        if missing:
            print(f"WARNING: metric definitions not found: {missing}")
        print(f"Metrics loaded: {list(metric_ids.keys())}")

        sensor_rows = await conn.fetch("SELECT id FROM sensors")
        sensor_ids = [r["id"] for r in sensor_rows]
        if not sensor_ids:
            print("FATAL: no sensors found in database")
            sys.exit(1)
        print(f"Sensors loaded: {len(sensor_ids)}")

        end_ts = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        start_ts = end_ts - timedelta(days=days)

        metric_keys = [k for k in _METRIC_META if k in metric_ids]
        anomalies = _build_anomalies(sensor_ids, metric_keys, start_ts, end_ts)
        print(f"Anomaly events generated: {sum(len(v) for v in anomalies.values())}")

        total = 0
        batch: list[tuple] = []
        current = start_ts

        while current < end_ts:
            doy = current.timetuple().tm_yday
            frac_hour = current.hour + current.minute / 60.0
            seasonal = _seasonal(doy)

            for sid in sensor_ids:
                batt = _clamp(
                    100 - (current - start_ts).total_seconds() / 86400 * 0.3
                    + random.uniform(-5, 5),
                    20, 100,
                )

                for mk in metric_keys:
                    meta = _METRIC_META[mk]
                    ampl = _anomaly_multiplier(current, sid, mk, anomalies)

                    if mk == "temperature":
                        base = meta["mean"] + seasonal + _diurnal_temp(frac_hour)
                        base += (float(hash(sid + "temp") % 10) - 5)
                        val = base + random.gauss(0, meta["std"] * 0.15)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "co2":
                        base = meta["mean"] + _diurnal_co2(frac_hour)
                        base += (float(hash(sid + "co2") % 100))
                        val = base + random.gauss(0, meta["std"] * 0.2)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "pressure":
                        base = meta["mean"] + seasonal * 0.3 + random.gauss(0, 2)
                        val = _clamp(base, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "humidity":
                        temp = _METRIC_META["temperature"]["mean"] + seasonal + _diurnal_temp(frac_hour)
                        val = _diurnal_humidity(frac_hour, temp) * ampl
                        val = _clamp(val, meta["min"], meta["max"])
                        val = round(val, 2)
                    elif mk == "pm25":
                        base = meta["mean"] + _diurnal_pm(frac_hour)
                        base += seasonal * 0.5
                        val = base + random.gauss(0, meta["std"] * 0.2)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "pm10":
                        base = meta["mean"] + _diurnal_pm(frac_hour) * 1.2
                        base += seasonal * 0.8
                        val = base + random.gauss(0, meta["std"] * 0.2)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "noise":
                        base = meta["mean"] + _diurnal_noise(frac_hour)
                        val = base + random.gauss(0, meta["std"] * 0.15)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "water_level":
                        base = meta["mean"] + _diurnal_water(frac_hour)
                        val = base + random.gauss(0, meta["std"] * 0.2)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 3)
                    elif mk == "uv_index":
                        base = _diurnal_uv(frac_hour)
                        base += seasonal * 0.3
                        val = base + random.gauss(0, 0.5)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "traffic_density":
                        base = meta["mean"] + _diurnal_traffic(frac_hour)
                        base += (float(hash(sid + "traffic") % 15) - 7)
                        val = base + random.gauss(0, meta["std"] * 0.2)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "energy_grid_load":
                        base = meta["mean"] + seasonal * 40 + _diurnal_load(frac_hour)
                        base += _diurnal_temp(frac_hour) * 30
                        val = base + random.gauss(0, meta["std"] * 0.15)
                        val = _clamp(val, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    elif mk == "dust_storm_index":
                        temp = _METRIC_META["temperature"]["mean"] + seasonal + _diurnal_temp(frac_hour)
                        humid = 70.0 - (temp - 15.0) * 0.8
                        spike = _dust_spike(frac_hour, temp, humid)
                        base = spike + random.gauss(0, 0.2)
                        val = _clamp(base, meta["min"], meta["max"]) * ampl
                        val = round(val, 2)
                    else:
                        continue

                    batch.append((
                        current, sid, metric_ids[mk],
                        val, None, round(batt, 1), "good",
                    ))

                    if len(batch) >= BATCH_SIZE:
                        await conn.copy_records_to_table(
                            "sensor_readings",
                            columns=[
                                "time", "sensor_id", "metric_id",
                                "value_numeric", "value_text",
                                "battery_level", "quality_flag",
                            ],
                            records=batch,
                        )
                        total += len(batch)
                        sys.stdout.write(f"\rInserted {total:,} rows ...")
                        sys.stdout.flush()
                        batch.clear()

            current += timedelta(minutes=INTERVAL_MINUTES)

        if batch:
            await conn.copy_records_to_table(
                "sensor_readings",
                columns=[
                    "time", "sensor_id", "metric_id",
                    "value_numeric", "value_text",
                    "battery_level", "quality_flag",
                ],
                records=batch,
            )
            total += len(batch)
            batch.clear()

        print(f"\nDone. {total:,} rows inserted in {(datetime.now(timezone.utc) - end_ts).total_seconds() + days * 86400:.0f}s simulated period.")

    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed historical sensor readings into TimescaleDB"
    )
    parser.add_argument(
        "--days", type=int, default=90,
        help="Number of days of historical data to generate (default: 90)",
    )
    args = parser.parse_args()
    asyncio.run(run(args.days))


if __name__ == "__main__":
    main()
