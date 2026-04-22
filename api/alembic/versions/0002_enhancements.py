"""enhancements: audit log, destruction, notifications, new unit statuses

Revision ID: 0002_enhancements
Revises: 0001_initial
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

revision: str = "0002_enhancements"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE ... ADD VALUE to run outside a transaction block
    # (on all versions prior to 12, and for maximum portability).  Commit the
    # Alembic-managed transaction, run ADD VALUE in autocommit mode, then let
    # subsequent DDL start a new implicit transaction via SQLAlchemy 2.0 autobegin.
    bind = op.get_bind()
    bind.execute(sa.text("COMMIT"))

    # Extend UnitStatus enum with new values
    bind.execute(sa.text("ALTER TYPE \"UnitStatus\" ADD VALUE IF NOT EXISTS 'DAMAGED'"))
    bind.execute(sa.text("ALTER TYPE \"UnitStatus\" ADD VALUE IF NOT EXISTS 'EXPIRED'"))
    bind.execute(sa.text("ALTER TYPE \"UnitStatus\" ADD VALUE IF NOT EXISTS 'DESTROYED'"))

    # --- AuditLog ---
    op.create_table(
        "AuditLog",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("userId", sa.Integer, sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String, nullable=False),
        sa.Column("resourceType", sa.String, nullable=True),
        sa.Column("resourceId", sa.String, nullable=True),
        sa.Column("detail", sa.Text, nullable=True),
        sa.Column("ipAddress", sa.String, nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False),
    )
    op.create_index("AuditLog_userId_idx", "AuditLog", ["userId"])
    op.create_index("AuditLog_createdAt_idx", "AuditLog", ["createdAt"])
    op.create_index("AuditLog_action_idx", "AuditLog", ["action"])

    # --- DestructionRecord ---
    op.create_table(
        "DestructionRecord",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("unitId", sa.Integer, sa.ForeignKey("SerializedUnit.id"), nullable=False),
        sa.Column("destroyedById", sa.Integer, sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("destroyedAt", sa.DateTime, nullable=False),
    )
    op.create_index("DestructionRecord_unitId_idx", "DestructionRecord", ["unitId"])

    # --- Notification ---
    op.create_table(
        "Notification",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("userId", sa.Integer, sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("isRead", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("createdAt", sa.DateTime, nullable=False),
    )
    op.create_index("Notification_userId_idx", "Notification", ["userId"])


def downgrade() -> None:
    op.drop_index("Notification_userId_idx", "Notification")
    op.drop_table("Notification")
    op.drop_index("DestructionRecord_unitId_idx", "DestructionRecord")
    op.drop_table("DestructionRecord")
    op.drop_index("AuditLog_action_idx", "AuditLog")
    op.drop_index("AuditLog_createdAt_idx", "AuditLog")
    op.drop_index("AuditLog_userId_idx", "AuditLog")
    op.drop_table("AuditLog")
    # Note: PostgreSQL does not support removing enum values; downgrade cannot
    # remove DAMAGED/EXPIRED/DESTROYED from UnitStatus.
