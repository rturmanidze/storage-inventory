"""Change shoeNumber column type from Integer to VARCHAR

Revision ID: 0010_shoe_number_string
Revises: 0009_shoe_material
Create Date: 2026-04-20 13:40:00.000000

Changes:
- Alters Shoe.shoeNumber from Integer to VARCHAR(32) so users can input
  alphanumeric shoe numbers (e.g. "1", "A1", "SHOE-01").
- Existing integer values are preserved as their string representation.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_shoe_number_string"
down_revision: Union[str, None] = "0009_shoe_material"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "Shoe",
        "shoeNumber",
        type_=sa.String(32),
        existing_type=sa.Integer(),
        postgresql_using='"shoeNumber"::VARCHAR',
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "Shoe",
        "shoeNumber",
        type_=sa.Integer(),
        existing_type=sa.String(32),
        postgresql_using='"shoeNumber"::INTEGER',
        nullable=False,
    )
