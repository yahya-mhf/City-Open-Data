import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..session import Base


class AnomalyEvent(Base):
    __tablename__ = "anomaly_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sensor_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False
    )
    metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("metric_definitions.id", ondelete="CASCADE"),
        nullable=False,
    )
    z_score: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
