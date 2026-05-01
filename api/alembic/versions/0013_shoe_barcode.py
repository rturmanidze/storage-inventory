"""Add barcode column to Shoe table for auto-generated unique barcodes

Revision ID: 0013_shoe_barcode
Revises: 0012_container_quantity_adjusted
Create Date: 2026-05-01 12:00:00.000000

Changes:
- Add barcode VARCHAR(32) UNIQUE NULL to Shoe table
  (NULL allows existing rows to remain without barcodes; new shoes always
   receive an auto-generated barcode at creation time)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_shoe_barcode"
down_revision: Union[str, None] = "0012_container_quantity_adjusted"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "Shoe",
        sa.Column("barcode", sa.String(32), nullable=True),
    )
    op.create_index("ix_shoe_barcode", "Shoe", ["barcode"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_shoe_barcode", table_name="Shoe")
    op.drop_column("Shoe", "barcode")
