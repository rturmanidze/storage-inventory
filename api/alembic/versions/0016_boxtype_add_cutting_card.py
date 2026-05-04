"""Add CUTTING_CARD value to BoxType enum

Revision ID: 0016_boxtype_add_cutting_card
Revises: 0015_deck_type_cutting_cards
Create Date: 2026-05-04 11:00:00.000000

Changes:
- Add 'CUTTING_CARD' to the PostgreSQL "BoxType" enum
  (ALTER TYPE ADD VALUE must run outside a transaction)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_boxtype_add_cutting_card"
down_revision: Union[str, Sequence[str], None] = "0015_deck_type_cutting_cards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Re-usable reference to BoxType that avoids CREATE TYPE on an existing enum.
box_type_enum = postgresql.ENUM(
    "STANDARD",
    "SPARE",
    "CUTTING_CARD",
    name="BoxType",
    create_type=False,
)


def upgrade() -> None:
    # ALTER TYPE ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE \"BoxType\" ADD VALUE IF NOT EXISTS 'CUTTING_CARD'"))


def downgrade() -> None:
    # PostgreSQL does not support removing individual enum values.
    # A full type rebuild would be required; omit for safety.
    pass
