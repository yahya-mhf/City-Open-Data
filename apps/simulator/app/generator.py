import math
import random
import time as _time
from datetime import datetime, timezone
from typing import Any

HOUR = 3600
_last_seismic_time: float = 0.0
MIN_SEISMIC_INTERVAL = 2 * HOUR


CITY_CENTER_LAT = 31.6295


class SensorState:
    def __init__(self, sensor_id: str, hub_id: str, latitude: float, longitude: float) -> None:
        self.sensor_id = sensor_id
        self.hub_id = hub_id
        self.latitude = latitude
        self.longitude = longitude
        self.battery = 100.0
        self.temperature = 20.0
        self.humidity = 55.0
        self.co2 = 400.0
        self.pressure = 1013.0
        self.rainfall = 0.0
        self.seismic = 0.0
        self.uv_index = 0.0
        self.traffic_density = 30.0
        self.energy_grid_load = 1800.0
        self.dust_storm_index = 0.0


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


def _diurnal_traffic_factor(now: datetime) -> float:
    hour = now.hour + now.minute / 60.0
    if 7 <= hour <= 9:
        return math.sin(math.pi * (hour - 7) / 2)
    if 17 <= hour <= 19:
        return math.sin(math.pi * (hour - 17) / 2)
    return 0.0


def _diurnal_uv_factor(now: datetime) -> float:
    hour = now.hour + now.minute / 60.0
    if 6 <= hour <= 18:
        return math.sin(math.pi * (hour - 6) / 12)
    return 0.0


def _diurnal_load_factor(now: datetime) -> float:
    hour = now.hour + now.minute / 60.0
    if 8 <= hour <= 12:
        return math.sin(math.pi * (hour - 8) / 4)
    if 14 <= hour <= 17:
        return math.sin(math.pi * (hour - 14) / 3)
    return 0.0


def _dust_storm_intensity(now: datetime, temp: float, humid: float) -> float:
    if temp < 30 or humid > 30:
        return 0.0
    hour = now.hour + now.minute / 60.0
    if 12 <= hour <= 17:
        intensity = (temp - 30) / 20 * (1 - humid / 100) * (1 - abs(hour - 14.5) / 2.5)
        return max(0.0, min(1.0, intensity))
    return 0.0


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def generate_readings(
    sensors: list[SensorState],
    realistic_time: bool,
    interval_seconds: int,
) -> list[dict[str, Any]]:
    global _last_seismic_time
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

        co2_target = 400.0 + t_factor * 200.0
        s.co2 += random.gauss(0, 5.0 * step)
        s.co2 += (co2_target - s.co2) * 0.02
        s.co2 = _clamp(s.co2, 350.0, 2000.0)

        s.pressure += random.gauss(0, 0.3 * step)
        s.pressure += (1013.0 - s.pressure) * 0.01
        s.pressure = _clamp(s.pressure, 980.0, 1050.0)

        s.rainfall += random.gauss(0, 2.0 * step)
        base_rain = 2.0 if t_factor > 0.6 else 0.5
        s.rainfall += (base_rain - s.rainfall) * 0.01
        s.rainfall = _clamp(s.rainfall, 0.0, 150.0)

        now_sec = _time.time()
        if now_sec - _last_seismic_time >= MIN_SEISMIC_INTERVAL and random.random() < 0.01:
            _last_seismic_time = now_sec
            s.seismic = random.uniform(3.5, 5.5)
        else:
            s.seismic += random.gauss(0, 0.05 * step)
            s.seismic += (0.1 - s.seismic) * 0.02
            s.seismic = _clamp(s.seismic, 0.0, 10.0)

        uv_target = _diurnal_uv_factor(now) * random.uniform(7.0, 11.0)
        s.uv_index += random.gauss(0, 0.2 * step)
        s.uv_index += (uv_target - s.uv_index) * 0.05
        s.uv_index = _clamp(s.uv_index, 0.0, 11.0)

        traffic_target = 20.0 + _diurnal_traffic_factor(now) * 80.0
        s.traffic_density += random.gauss(0, 3.0 * step)
        s.traffic_density += (traffic_target - s.traffic_density) * 0.03
        s.traffic_density = _clamp(s.traffic_density, 0.0, 200.0)

        load_temp_bias = (s.temperature - 15.0) * 30.0
        load_target = 1800.0 + _diurnal_load_factor(now) * 500.0 + max(0.0, load_temp_bias)
        s.energy_grid_load += random.gauss(0, 20.0 * step)
        s.energy_grid_load += (load_target - s.energy_grid_load) * 0.02
        s.energy_grid_load = _clamp(s.energy_grid_load, 0.0, 5000.0)

        dust_target = _dust_storm_intensity(now, s.temperature, s.humidity) * 5.0
        s.dust_storm_index += random.gauss(0, 0.1 * step)
        s.dust_storm_index += (dust_target - s.dust_storm_index) * 0.02
        s.dust_storm_index = _clamp(s.dust_storm_index, 0.0, 5.0)

        drain = 0.05 * step * (0.5 + t_factor)
        s.battery -= drain
        if s.battery < 20 and random.random() < 0.02 * step:
            s.battery += random.uniform(5, 15)
        if s.battery < 5:
            s.battery += random.uniform(10, 30)
        s.battery = _clamp(s.battery, 0.0, 100.0)

        lat_offset = s.latitude - CITY_CENTER_LAT
        lat_bias = 1.0 + lat_offset * 5.0
        s.temperature = _clamp(s.temperature * lat_bias, -5.0, 50.0)
        s.humidity = _clamp(s.humidity * lat_bias, 10.0, 100.0)
        s.co2 = _clamp(s.co2 * lat_bias, 350.0, 2000.0)
        s.pressure = _clamp(s.pressure * lat_bias, 980.0, 1050.0)
        s.rainfall = _clamp(s.rainfall * lat_bias, 0.0, 150.0)
        s.seismic = _clamp(s.seismic * lat_bias, 0.0, 10.0)
        s.uv_index = _clamp(s.uv_index * lat_bias, 0.0, 11.0)
        s.traffic_density = _clamp(s.traffic_density * lat_bias, 0.0, 200.0)
        s.energy_grid_load = _clamp(s.energy_grid_load * lat_bias, 0.0, 5000.0)
        s.dust_storm_index = _clamp(s.dust_storm_index * lat_bias, 0.0, 5.0)

        metrics = {
            "temperature": round(s.temperature, 1),
            "humidity": round(s.humidity, 1),
            "co2": round(s.co2, 1),
            "pressure": round(s.pressure, 1),
            "rainfall": round(s.rainfall, 2),
            "seismic": round(s.seismic, 3),
            "uv_index": round(s.uv_index, 2),
            "traffic_density": round(s.traffic_density, 1),
            "energy_grid_load": round(s.energy_grid_load, 1),
            "dust_storm_index": round(s.dust_storm_index, 2),
        }

        reading = {
            "sensor_id": s.sensor_id,
            "timestamp": now.isoformat(),
            "battery": round(s.battery, 1),
            "metrics": metrics,
        }
        readings.append(reading)

    return readings
