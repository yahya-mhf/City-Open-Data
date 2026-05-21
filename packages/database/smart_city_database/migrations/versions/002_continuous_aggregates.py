"""add timescaledb continuous aggregates

Revision ID: 002
Revises: 001
Create Date: 2026-05-21

"""

from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE MATERIALIZED VIEW sensor_readings_hourly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 hour', time) AS bucket,
            sensor_id,
            metric_id,
            AVG(value_numeric) AS avg_value,
            MIN(value_numeric) AS min_value,
            MAX(value_numeric) AS max_value,
            COUNT(*) AS sample_count
        FROM sensor_readings
        GROUP BY bucket, sensor_id, metric_id
        WITH NO DATA;
    """)

    op.execute("""
        SELECT add_continuous_aggregate_policy('sensor_readings_hourly',
            start_offset => INTERVAL '3 hours',
            end_offset   => INTERVAL '1 hour',
            schedule_interval => INTERVAL '30 minutes');
    """)

    op.execute("""
        CREATE MATERIALIZED VIEW sensor_readings_daily
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 day', time) AS bucket,
            sensor_id,
            metric_id,
            AVG(value_numeric) AS avg_value,
            MIN(value_numeric) AS min_value,
            MAX(value_numeric) AS max_value,
            COUNT(*) AS sample_count
        FROM sensor_readings
        GROUP BY bucket, sensor_id, metric_id
        WITH NO DATA;
    """)

    op.execute("""
        SELECT add_continuous_aggregate_policy('sensor_readings_daily',
            start_offset => INTERVAL '3 days',
            end_offset   => INTERVAL '1 day',
            schedule_interval => INTERVAL '1 day');
    """)


def downgrade() -> None:
    op.execute("SELECT remove_continuous_aggregate_policy('sensor_readings_hourly');")
    op.execute("SELECT remove_continuous_aggregate_policy('sensor_readings_daily');")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS sensor_readings_hourly CASCADE;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS sensor_readings_daily CASCADE;")
