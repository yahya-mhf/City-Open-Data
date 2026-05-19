import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..session import Base


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True
    )
    sensor_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("sensors.id", ondelete="CASCADE"),
        primary_key=True,
    )
    metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("metric_definitions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    value_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    battery_level: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_flag: Mapped[str | None] = mapped_column(String(20), nullable=True, default="good")
