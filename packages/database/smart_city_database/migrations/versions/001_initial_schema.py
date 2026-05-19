"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-14

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="citizen"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "hubs",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="online"),
    )

    op.create_table(
        "sensors",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(100), nullable=False, server_default="environmental"),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("installed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "metric_definitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("unit", sa.String(100), nullable=False),
        sa.Column("data_type", sa.String(50), nullable=False, server_default="float"),
        sa.Column("category", sa.String(100), nullable=False, server_default="air_quality"),
        sa.Column("min_value", sa.Float, nullable=True),
        sa.Column("max_value", sa.Float, nullable=True),
        sa.Column("thresholds_json", JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "sensor_readings",
        sa.Column("time", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("sensor_id", sa.String(100), sa.ForeignKey("sensors.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("metric_id", UUID(as_uuid=True), sa.ForeignKey("metric_definitions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("value_numeric", sa.Float, nullable=True),
        sa.Column("value_text", sa.Text, nullable=True),
        sa.Column("battery_level", sa.Float, nullable=True),
        sa.Column("quality_flag", sa.String(20), nullable=True, server_default="good"),
    )

    op.execute("SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);")

    op.create_table(
        "alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sensor_id", sa.String(100), sa.ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("severity", sa.String(50), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("acknowledged", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "citizen_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("image_url", sa.Text, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "report_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("report_id", UUID(as_uuid=True), sa.ForeignKey("citizen_reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("comment", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index("ix_sensor_readings_sensor_time", "sensor_readings", ["sensor_id", "time"])
    op.create_index("ix_alerts_sensor", "alerts", ["sensor_id"])
    op.create_index("ix_reports_user", "citizen_reports", ["user_id"])


def downgrade() -> None:
    op.drop_table("report_comments")
    op.drop_table("citizen_reports")
    op.drop_table("alerts")
    op.drop_table("sensor_readings")
    op.drop_table("metric_definitions")
    op.drop_table("sensors")
    op.drop_table("hubs")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
