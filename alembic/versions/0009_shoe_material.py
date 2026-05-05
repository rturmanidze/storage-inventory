"""Add material column to Shoe table

Revision ID: 0009_shoe_material
Revises: 0008_containers
Create Date: 2026-04-20 15:00:00.000000

Changes:
- Adds nullable material column (CardMaterial enum) to Shoe.
  Nullable so existing shoes are not broken; new shoes always receive a value.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_shoe_material"
down_revision: Union[str, None] = "0008_containers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "Shoe",
        sa.Column(
            "material",
            postgresql.ENUM("PLASTIC", "PAPER", name="CardMaterial", create_type=False),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("Shoe", "material")
