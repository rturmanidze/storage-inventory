"""Shoe lifecycle overhaul: separate card destruction from physical shoe destruction

Revision ID: 0006_shoe_lifecycle
Revises: 0005_shoe_number
Create Date: 2026-04-20 12:00:00.000000

Changes:
- Adds CARDS_DESTROYED, EMPTY_SHOE_IN_WAREHOUSE, PHYSICALLY_DAMAGED, PHYSICALLY_DESTROYED
  to the ShoeStatus enum.
- Migrates all existing DESTROYED rows to CARDS_DESTROYED (the old 'destroy' action
  was conceptually destroying cards, not the physical shoe container).
- Adds tracking columns for shoe recovery, physical damage reporting, and physical
  destruction events.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_shoe_lifecycle"
down_revision: Union[str, None] = "0005_shoe_number"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend ShoeStatus with new lifecycle values
    op.execute("ALTER TYPE \"ShoeStatus\" ADD VALUE IF NOT EXISTS 'CARDS_DESTROYED'")
    op.execute("ALTER TYPE \"ShoeStatus\" ADD VALUE IF NOT EXISTS 'EMPTY_SHOE_IN_WAREHOUSE'")
    op.execute("ALTER TYPE \"ShoeStatus\" ADD VALUE IF NOT EXISTS 'PHYSICALLY_DAMAGED'")
    op.execute("ALTER TYPE \"ShoeStatus\" ADD VALUE IF NOT EXISTS 'PHYSICALLY_DESTROYED'")

    # Migrate existing DESTROYED records → CARDS_DESTROYED
    # (the old destroy workflow was always destroying cards, not the physical container)
    op.execute("UPDATE \"Shoe\" SET status = 'CARDS_DESTROYED' WHERE status = 'DESTROYED'")

    # Tracking columns for shoe recovery from CARDS_DESTROYED → EMPTY_SHOE_IN_WAREHOUSE
    op.add_column("Shoe", sa.Column("recoveredAt", sa.DateTime, nullable=True))
    op.add_column(
        "Shoe",
        sa.Column(
            "recoveredById",
            sa.Integer,
            sa.ForeignKey("User.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Tracking columns for physical damage report
    op.add_column("Shoe", sa.Column("physicalDamageReason", sa.Text, nullable=True))
    op.add_column("Shoe", sa.Column("physicalDamageAt", sa.DateTime, nullable=True))
    op.add_column(
        "Shoe",
        sa.Column(
            "physicalDamageById",
            sa.Integer,
            sa.ForeignKey("User.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Tracking columns for confirmed physical destruction
    op.add_column("Shoe", sa.Column("physicallyDestroyedAt", sa.DateTime, nullable=True))
    op.add_column(
        "Shoe",
        sa.Column(
            "physicallyDestroyedById",
            sa.Integer,
            sa.ForeignKey("User.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("Shoe", "physicallyDestroyedById")
    op.drop_column("Shoe", "physicallyDestroyedAt")
    op.drop_column("Shoe", "physicalDamageById")
    op.drop_column("Shoe", "physicalDamageAt")
    op.drop_column("Shoe", "physicalDamageReason")
    op.drop_column("Shoe", "recoveredById")
    op.drop_column("Shoe", "recoveredAt")
    # Revert CARDS_DESTROYED back to DESTROYED for backward compat
    op.execute("UPDATE \"Shoe\" SET status = 'DESTROYED' WHERE status = 'CARDS_DESTROYED'")
    # Note: PostgreSQL does not support removing enum values; new values remain in type.
