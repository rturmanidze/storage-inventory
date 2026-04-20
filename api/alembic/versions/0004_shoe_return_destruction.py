"""shoe return and destruction workflow enhancements

Adds RETURNED and DESTROYED statuses to ShoeStatus enum.
Adds tracking columns to Shoe for return and destruction events.

Revision ID: 0004_shoe_return_destruction
Revises: 0003_studios_and_cards
Create Date: 2026-04-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_shoe_return_destruction"
down_revision: Union[str, None] = "0003_studios_and_cards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE ... ADD VALUE to run outside a transaction block.
    # Commit the Alembic-managed transaction, run the ADD VALUE statements (which execute
    # in autocommit / no-transaction mode), then let subsequent DDL start a new implicit
    # transaction via SQLAlchemy 2.0's autobegin behaviour.
    bind = op.get_bind()
    bind.execute(sa.text("COMMIT"))

    # Extend ShoeStatus enum with RETURNED and DESTROYED
    bind.execute(sa.text("ALTER TYPE \"ShoeStatus\" ADD VALUE IF NOT EXISTS 'RETURNED'"))
    bind.execute(sa.text("ALTER TYPE \"ShoeStatus\" ADD VALUE IF NOT EXISTS 'DESTROYED'"))

    # Add return-tracking columns to Shoe
    op.add_column("Shoe", sa.Column("returnedAt", sa.DateTime, nullable=True))
    op.add_column(
        "Shoe",
        sa.Column(
            "returnedById",
            sa.Integer,
            sa.ForeignKey("User.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Add destruction-tracking columns to Shoe
    op.add_column("Shoe", sa.Column("destroyedAt", sa.DateTime, nullable=True))
    op.add_column(
        "Shoe",
        sa.Column(
            "destroyedById",
            sa.Integer,
            sa.ForeignKey("User.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("Shoe", sa.Column("destroyReason", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("Shoe", "destroyReason")
    op.drop_column("Shoe", "destroyedById")
    op.drop_column("Shoe", "destroyedAt")
    op.drop_column("Shoe", "returnedById")
    op.drop_column("Shoe", "returnedAt")
    # Note: PostgreSQL does not support removing enum values; downgrade leaves
    # RETURNED/DESTROYED in the ShoeStatus type.
