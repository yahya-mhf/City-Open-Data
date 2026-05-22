"""add anomaly_events table

Revision ID: 004
Revises: 003
Create Date: 2026-05-22

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "anomaly_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("sensor_id", sa.String(100), sa.ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric_id", UUID(as_uuid=True), sa.ForeignKey("metric_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("z_score", sa.Float(), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("time", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_anomaly_events_sensor_metric", "anomaly_events", ["sensor_id", "metric_id"])
    op.create_index("ix_anomaly_events_time", "anomaly_events", ["time"])


def downgrade() -> None:
    op.drop_index("ix_anomaly_events_time", table_name="anomaly_events")
    op.drop_index("ix_anomaly_events_sensor_metric", table_name="anomaly_events")
    op.drop_table("anomaly_events")
