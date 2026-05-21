"""add api key system tables and columns

Revision ID: 003
Revises: 002
Create Date: 2026-05-21

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("api_keys", sa.Column("key_prefix", sa.String(8), nullable=False, server_default=""))
    op.add_column("api_keys", sa.Column("description", sa.Text, nullable=True))
    op.add_column("api_keys", sa.Column("tier", sa.String(20), nullable=False, server_default="free"))
    op.add_column("api_keys", sa.Column("allowed_metrics", ARRAY(sa.String), nullable=True))
    op.add_column("api_keys", sa.Column("allowed_endpoints", ARRAY(sa.String), nullable=True))
    op.add_column("api_keys", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("api_keys", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("api_keys", sa.Column("total_requests", sa.BigInteger, nullable=False, server_default=sa.text("0")))

    op.create_table(
        "api_key_usage",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("api_key_id", UUID(as_uuid=True), sa.ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("status_code", sa.Integer, nullable=False),
        sa.Column("response_time_ms", sa.Integer, nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("ip_address", sa.String(45), nullable=True),
    )

    op.create_index("ix_api_key_usage_key_time", "api_key_usage", ["api_key_id", "requested_at"])


def downgrade() -> None:
    op.drop_index("ix_api_key_usage_key_time", table_name="api_key_usage")
    op.drop_table("api_key_usage")

    op.drop_column("api_keys", "total_requests")
    op.drop_column("api_keys", "expires_at")
    op.drop_column("api_keys", "last_used_at")
    op.drop_column("api_keys", "allowed_endpoints")
    op.drop_column("api_keys", "allowed_metrics")
    op.drop_column("api_keys", "tier")
    op.drop_column("api_keys", "description")
    op.drop_column("api_keys", "key_prefix")
