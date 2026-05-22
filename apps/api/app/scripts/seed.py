"""Seed the database with initial data."""
import asyncio

from sqlalchemy import select

from smart_city_auth import PasswordHandler
from smart_city_database import Base, SessionLocal, engine
from smart_city_database.models import (
    Hub,
    MetricDefinition,
    Sensor,
    User,
    Subscription,
)
from smart_city_shared.enums import MetricCategory, UserRole, SubscriptionPlan, SubscriptionStatus


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        admin_check = await session.execute(select(User).where(User.email == "admin@smartcity.com"))
        if not admin_check.scalar_one_or_none():
            pw = PasswordHandler()
            admin = User(
                email="admin@smartcity.com",
                password_hash=pw.hash_password("admin123"),
                full_name="System Admin",
                role=UserRole.ADMIN,
                plan=SubscriptionPlan.ENTERPRISE,
            )
            session.add(admin)
            await session.flush()
            session.add(Subscription(user_id=admin.id, plan=SubscriptionPlan.ENTERPRISE, status=SubscriptionStatus.ACTIVE))

            citizen = User(
                email="citizen@smartcity.com",
                password_hash=pw.hash_password("citizen123"),
                full_name="Test Citizen",
                role=UserRole.CITIZEN,
                plan=SubscriptionPlan.FREE,
            )
            session.add(citizen)
            await session.flush()
            session.add(Subscription(user_id=citizen.id, plan=SubscriptionPlan.FREE, status=SubscriptionStatus.ACTIVE))

            pro_user = User(
                email="pro@smartcity.com",
                password_hash=pw.hash_password("pro123"),
                full_name="Pro User",
                role=UserRole.CITIZEN,
                plan=SubscriptionPlan.PRO,
            )
            session.add(pro_user)
            await session.flush()
            session.add(Subscription(user_id=pro_user.id, plan=SubscriptionPlan.PRO, status=SubscriptionStatus.ACTIVE))

        hub_check = await session.execute(select(Hub).where(Hub.id == "hub-001"))
        if not hub_check.scalar_one_or_none():
            hub = Hub(id="hub-001", name="Downtown Hub", latitude=31.6295, longitude=-7.9811)
            session.add(hub)

        hub2_check = await session.execute(select(Hub).where(Hub.id == "hub-002"))
        if not hub2_check.scalar_one_or_none():
            hub2 = Hub(id="hub-002", name="Guéliz Hub", latitude=31.6300, longitude=-8.0200)
            session.add(hub2)

        metric_check = await session.execute(select(MetricDefinition).where(MetricDefinition.key == "temperature"))
        if not metric_check.scalar_one_or_none():
            metrics = [
                MetricDefinition(key="temperature", display_name="Temperature", unit="°C", category=MetricCategory.WEATHER, min_value=-20, max_value=60, thresholds_json={"medium_hi": 35, "high_hi": 45}),
                MetricDefinition(key="humidity", display_name="Humidity", unit="%", category=MetricCategory.WEATHER, min_value=0, max_value=100, thresholds_json={"low": 20, "high": 80}),
                MetricDefinition(key="rainfall", display_name="Rainfall", unit="mm/h", category=MetricCategory.HYDROLOGY, min_value=0, max_value=150, thresholds_json={"high": 50, "extreme": 100}),
                MetricDefinition(key="seismic", display_name="Seismic Activity", unit="richter", category=MetricCategory.SAFETY, min_value=0, max_value=10, thresholds_json={"medium": 2.0, "high": 2.5, "critical": 4.0}),
                MetricDefinition(key="co2", display_name="CO2", unit="ppm", category=MetricCategory.AIR_QUALITY, min_value=350, max_value=2000, thresholds_json={"high": 1000}),
                MetricDefinition(key="pressure", display_name="Atmospheric Pressure", unit="hPa", category=MetricCategory.WEATHER, min_value=980, max_value=1050),
                MetricDefinition(key="uv_index", display_name="UV Index", unit="", category=MetricCategory.RADIATION, min_value=0, max_value=11, thresholds_json={"medium": 5, "high": 8, "extreme": 11}),
                MetricDefinition(key="traffic_density", display_name="Traffic Density", unit="veh/min", category=MetricCategory.TRAFFIC, min_value=0, max_value=200, thresholds_json={"medium_hi": 80, "high_hi": 150}),
                MetricDefinition(key="energy_grid_load", display_name="Energy Grid Load", unit="MW", category=MetricCategory.ENERGY, min_value=0, max_value=5000, thresholds_json={"medium_hi": 3000, "high_hi": 4000}),
                MetricDefinition(key="dust_storm_index", display_name="Dust Storm Index", unit="", category=MetricCategory.WEATHER, min_value=0, max_value=5, thresholds_json={"medium": 2, "high": 3, "extreme": 4}),
            ]
            for m in metrics:
                session.add(m)

        sensor_check = await session.execute(select(Sensor).limit(1))
        if not sensor_check.scalar_one_or_none():
            sensors = [
                Sensor(id="hub-001-sensor-001", name="Medina Air Station", latitude=31.6300, longitude=-7.9820),
                Sensor(id="hub-001-sensor-002", name="Koutoubia Park Monitor", latitude=31.6240, longitude=-7.9900),
                Sensor(id="hub-001-sensor-003", name="Tensift River Gauge", latitude=31.6400, longitude=-7.9700),
                Sensor(id="hub-001-sensor-004", name="Jemaa el-Fna Node", latitude=31.6258, longitude=-7.9891),
                Sensor(id="hub-001-sensor-005", name="Medina Weather Station", latitude=31.6320, longitude=-7.9780),
                Sensor(id="hub-002-sensor-001", name="Guéliz Station", latitude=31.6280, longitude=-8.0220),
                Sensor(id="hub-002-sensor-002", name="Majorelle Garden Sensor", latitude=31.6420, longitude=-8.0030),
                Sensor(id="hub-002-sensor-003", name="Guéliz Water Level", latitude=31.6350, longitude=-8.0180),
                Sensor(id="hub-002-sensor-004", name="Guéliz Noise Monitor", latitude=31.6260, longitude=-8.0250),
                Sensor(id="hub-002-sensor-005", name="Guéliz Air Quality", latitude=31.6330, longitude=-8.0150),
                Sensor(id="hub-003-sensor-001", name="Industrial Zone Monitor", latitude=31.6100, longitude=-8.0500),
                Sensor(id="hub-003-sensor-002", name="Industrial Air Station", latitude=31.6150, longitude=-8.0450),
                Sensor(id="hub-003-sensor-003", name="Industrial Water Gauge", latitude=31.6200, longitude=-8.0550),
                Sensor(id="hub-003-sensor-004", name="Perimeter Noise Sensor", latitude=31.6050, longitude=-8.0480),
                Sensor(id="hub-003-sensor-005", name="Industrial Weather Hub", latitude=31.6120, longitude=-8.0420),
            ]
            for s in sensors:
                session.add(s)

        await session.commit()
        print("Seed data created successfully!")


if __name__ == "__main__":
    asyncio.run(seed())
