"""Add QUANTITY_ADJUSTED to ContainerEventType enum; update capacity constant 176→192

Revision ID: 0012_container_quantity_adjusted
Revises: 0011_boxes_and_rbac
Create Date: 2026-04-23 13:00:00.000000

Changes:
- Add QUANTITY_ADJUSTED value to ContainerEventType enum
  (container capacity constant change 176→192 is code-only, no column alter)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_container_quantity_adjusted"
down_revision: Union[str, None] = "0011_boxes_and_rbac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE must run outside a transaction
    with op.get_context().autocommit_block():
        op.execute(sa.text(
            "ALTER TYPE \"ContainerEventType\" ADD VALUE IF NOT EXISTS 'QUANTITY_ADJUSTED'"
        ))


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is a no-op
    pass
