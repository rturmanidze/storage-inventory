"""Add CUTTING_CARD value to BoxType enum

Revision ID: 0016_boxtype_add_cutting_card
Revises: 0015_deck_type_cutting_cards
Create Date: 2026-05-04 11:00:00.000000

Changes:
- BoxType is now a plain VARCHAR column; this migration is a no-op kept for
  history and to preserve the migration chain.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0016_boxtype_add_cutting_card"
down_revision: Union[str, Sequence[str], None] = "0015_deck_type_cutting_cards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # BoxType is stored as VARCHAR; no enum type alteration needed.
    pass


def downgrade() -> None:
    pass
