"""Add cuttingCardCount column to Shoe table

Revision ID: 0018_cutting_card_count
Revises: 0017_enum_to_string
Create Date: 2026-05-05 07:30:00.000000

Changes:
- Add cuttingCardCount INTEGER NOT NULL DEFAULT 0 to Shoe table
  (tracks how many cutting cards were consumed when the shoe was assembled)

Note: No ENUM type alteration is needed here because migration 0017_enum_to_string
has already converted all ENUM columns to plain VARCHAR.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018_cutting_card_count"
down_revision: Union[str, None] = "0017_enum_to_string"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "Shoe",
        sa.Column("cuttingCardCount", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("Shoe", "cuttingCardCount")
