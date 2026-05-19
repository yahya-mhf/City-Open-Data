import math
import random
from datetime import datetime, timezone
from typing import Any

HOUR = 3600


class SensorState:
    def __init__(self, sensor_id: str, hub_id: str) -> None:
        self.sensor_id = sensor_id
        self.hub_id = hub_id
        self.battery = 100.0
        self.temperature = 20.0
        self.humidity = 55.0
        self.pm25 = 15.0
        self.pm10 = 25.0
        self.noise = 40.0
        self.co2 = 400.0
        self.pressure = 1013.0
        self.uv_index = 3.0
        self.water_level = 1.2
        self._construction_timer = 0
        self._aqi_spike_timer = 0


def _time_of_day_factor(now: datetime) -> float:
    hour = now.hour + now.minute / 60.0
    day_start = 6.0
    rush_hour_morning = 8.0
    midday = 13.0
    rush_hour_evening = 18.0
    night = 22.0

    if hour < day_start:
        return 0.3
    if hour < rush_hour_morning:
        t = (hour - day_start) / (rush_hour_morning - day_start)
        return 0.3 + 0.7 * t
    if hour < midday:
        t = (hour - rush_hour_morning) / (midday - rush_hour_morning)
        return 1.0 - 0.3 * t
    if hour < rush_hour_evening:
        t = (hour - midday) / (rush_hour_evening - midday)
        return 0.7 + 0.3 * t
    if hour < night:
        t = (hour - rush_hour_evening) / (night - rush_hour_evening)
        return 1.0 - 0.7 * t
    return 0.3


def _seasonal_base_temp(now: datetime) -> float:
    day_of_year = now.timetuple().tm_yday
    amplitude = 8.0
    base = 20.0
    return base + amplitude * math.sin(2 * math.pi * (day_of_year - 80) / 365)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def generate_readings(
    sensors: list[SensorState],
    realistic_time: bool,
    interval_seconds: int,
) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    t_factor = _time_of_day_factor(now) if realistic_time else 0.5
    seasonal_temp = _seasonal_base_temp(now) if realistic_time else 20.0

    readings: list[dict[str, Any]] = []

    for s in sensors:
        step = math.sqrt(interval_seconds / 5.0)

        s.temperature += random.gauss(0, 0.3 * step)
        target_temp = seasonal_temp + (t_factor - 0.5) * 3.0
        s.temperature += (target_temp - s.temperature) * 0.05
        s.temperature = _clamp(s.temperature, -5.0, 50.0)

        target_humidity = 70.0 - (s.temperature - 15.0) * 0.8
        s.humidity += random.gauss(0, 0.5 * step)
        s.humidity += (target_humidity - s.humidity) * 0.03
        s.humidity = _clamp(s.humidity, 10.0, 100.0)

        s._aqi_spike_timer -= 1
        if s._aqi_spike_timer <= 0:
            if random.random() < 0.01 * step:
                s.pm25 += random.uniform(30, 80)
                s.pm10 += random.uniform(50, 150)
                s._aqi_spike_timer = random.randint(5, 15)
            else:
                rush_hour_bonus = 0.0
                if realistic_time:
                    hr = now.hour
                    if (7 <= hr <= 9) or (17 <= hr <= 19):
                        rush_hour_bonus = 10.0
                s.pm25 += random.gauss(0, 1.0 * step) + rush_hour_bonus * 0.05
                s.pm10 += random.gauss(0, 2.0 * step) + rush_hour_bonus * 0.1
        s.pm25 += (10.0 - s.pm25) * 0.02
        s.pm25 = _clamp(s.pm25, 0.0, 500.0)
        s.pm10 += (20.0 - s.pm10) * 0.02
        s.pm10 = _clamp(s.pm10, 0.0, 600.0)

        s._construction_timer -= 1
        if s._construction_timer <= 0:
            if random.random() < 0.005 * step:
                s.noise += random.uniform(20, 40)
                s._construction_timer = random.randint(2, 10)
            else:
                baseline = 35.0 + t_factor * 10.0
                s.noise += random.gauss(0, 1.5 * step)
                s.noise += (baseline - s.noise) * 0.03
        s.noise = _clamp(s.noise, 25.0, 120.0)

        co2_target = 400.0 + t_factor * 200.0
        s.co2 += random.gauss(0, 5.0 * step)
        s.co2 += (co2_target - s.co2) * 0.02
        s.co2 = _clamp(s.co2, 350.0, 2000.0)

        s.pressure += random.gauss(0, 0.3 * step)
        s.pressure += (1013.0 - s.pressure) * 0.01
        s.pressure = _clamp(s.pressure, 980.0, 1050.0)

        uv_base = 0.0 if t_factor < 0.4 else (t_factor - 0.4) * 15.0
        s.uv_index += random.gauss(0, 0.2 * step)
        s.uv_index += (uv_base - s.uv_index) * 0.1
        if s.uv_index < 0:
            s.uv_index = 0
        if not realistic_time:
            s.uv_index = _clamp(s.uv_index, 0.0, 11.0)
        else:
            if now.hour < 6 or now.hour > 20:
                s.uv_index = 0.0

        s.water_level += random.gauss(0, 0.05 * step)
        s.water_level += (1.2 - s.water_level) * 0.01
        s.water_level = _clamp(s.water_level, 0.0, 5.0)

        drain = 0.05 * step * (0.5 + t_factor)
        s.battery -= drain
        if s.battery < 20 and random.random() < 0.02 * step:
            s.battery += random.uniform(5, 15)
        if s.battery < 5:
            s.battery += random.uniform(10, 30)
        s.battery = _clamp(s.battery, 0.0, 100.0)

        metrics = {
            "temperature": round(s.temperature, 1),
            "humidity": round(s.humidity, 1),
            "pm25": round(s.pm25, 1),
            "pm10": round(s.pm10, 1),
            "noise": round(s.noise, 1),
            "co2": round(s.co2, 1),
            "pressure": round(s.pressure, 1),
            "uv_index": round(s.uv_index),
            "water_level": round(s.water_level, 2),
        }

        reading = {
            "sensor_id": s.sensor_id,
            "timestamp": now.isoformat(),
            "battery": round(s.battery, 1),
            "metrics": metrics,
        }
        readings.append(reading)

    return readings
