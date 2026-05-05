"""Merge 0001 legacy branch with main casino WMS chain

Revision ID: 0014_merge_heads
Revises: 0001, 0013_shoe_barcode
Create Date: 2026-05-01 00:00:00.000000

Merges the legacy generic-WMS branch (0001) with the casino WMS chain
(0013_shoe_barcode) so that 'alembic upgrade head' has exactly one target.
No schema changes — this is a bookkeeping-only merge revision.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014_merge_heads"
down_revision: Union[str, Sequence[str], None] = "0013_shoe_barcode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
