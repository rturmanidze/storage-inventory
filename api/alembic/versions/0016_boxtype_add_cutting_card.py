"""Add CUTTING_CARD value to BoxType enum

Revision ID: 0016_boxtype_add_cutting_card
Revises: 0015_deck_type_cutting_cards
Create Date: 2026-05-04 11:00:00.000000

Changes:
- Add 'CUTTING_CARD' to the PostgreSQL "BoxType" enum
  (ALTER TYPE ADD VALUE must run outside a transaction)
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0016_boxtype_add_cutting_card"
down_revision: Union[str, Sequence[str], None] = "0015_deck_type_cutting_cards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IMPORTANT:
    # ALTER TYPE must run outside transaction
    with op.get_context().autocommit_block():
        op.execute(
            sa.text(
                "ALTER TYPE \"BoxType\" ADD VALUE IF NOT EXISTS 'CUTTING_CARD'"
            )
        )


def downgrade() -> None:
    # PostgreSQL does NOT support removing enum values safely.
    # Proper downgrade would require full type recreation → risky.
    pass
