"""Empty Shoe Refill workflow: REFILLED status + refill tracking columns

Revision ID: 0007_shoe_refill
Revises: 0006_shoe_lifecycle
Create Date: 2026-04-20 13:00:00.000000

Changes:
- Adds REFILLED to the ShoeStatus enum.
- Adds refilledAt and refilledById columns to the Shoe table to track
  when a shoe was refilled and by whom.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_shoe_refill"
down_revision: Union[str, None] = "0006_shoe_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE ... ADD VALUE to run outside a transaction block.
    # Use autocommit_block() so Alembic properly tracks the transaction lifecycle
    # instead of a raw COMMIT which can leave alembic_version in an inconsistent state.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE \"ShoeStatus\" ADD VALUE IF NOT EXISTS 'REFILLED'"))

    # Tracking columns for shoe refill event
    op.add_column("Shoe", sa.Column("refilledAt", sa.DateTime, nullable=True))
    op.add_column(
        "Shoe",
        sa.Column(
            "refilledById",
            sa.Integer,
            sa.ForeignKey("User.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("Shoe", "refilledById")
    op.drop_column("Shoe", "refilledAt")
    # Revert any REFILLED shoes back to IN_WAREHOUSE so we can remove the status
    op.execute("UPDATE \"Shoe\" SET status = 'IN_WAREHOUSE' WHERE status = 'REFILLED'")
    # Note: PostgreSQL does not support removing enum values; REFILLED remains in type.
