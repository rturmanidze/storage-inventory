"""Add CUTTING value to CardColor enum and cuttingCardCount column to Shoe

Revision ID: 0014_cutting_cards
Revises: 0013_shoe_barcode
Create Date: 2026-05-05 07:00:00.000000

Changes:
- Add 'CUTTING' value to "CardColor" PostgreSQL ENUM type
  (cutting cards are universal — no BLACK/RED distinction)
- Add cuttingCardCount INTEGER NOT NULL DEFAULT 0 to Shoe table
  (tracks how many cutting cards were consumed when the shoe was assembled)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_cutting_cards"
down_revision: Union[str, None] = "0013_shoe_barcode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE must run outside a transaction
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE \"CardColor\" ADD VALUE IF NOT EXISTS 'CUTTING'"))

    # Add cuttingCardCount to Shoe (default 0 for all existing rows)
    op.add_column(
        "Shoe",
        sa.Column("cuttingCardCount", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("Shoe", "cuttingCardCount")
    # Note: PostgreSQL does not support removing enum values; CUTTING remains in the type.
    # To fully reverse, drop and recreate the enum if required.
