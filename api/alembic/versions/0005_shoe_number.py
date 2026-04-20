"""Add shoeNumber reusable display number to Shoe

Revision ID: 0005_shoe_number
Revises: 0004_shoe_return_destruction
Create Date: 2026-04-20 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_shoe_number"
down_revision: Union[str, None] = "0004_shoe_return_destruction"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add shoeNumber column — nullable initially so existing rows can be backfilled
    op.add_column("Shoe", sa.Column("shoeNumber", sa.Integer, nullable=True))

    # Backfill: assign shoeNumber = id for all existing shoes so they have a value
    op.execute("UPDATE \"Shoe\" SET \"shoeNumber\" = id WHERE \"shoeNumber\" IS NULL")

    # Make non-nullable after backfill
    op.alter_column("Shoe", "shoeNumber", nullable=False)


def downgrade() -> None:
    op.drop_column("Shoe", "shoeNumber")
