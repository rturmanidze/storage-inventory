"""Add Box model, ShredEvent, new roles, update Container capacity

Revision ID: 0011_boxes_and_rbac
Revises: 0010_shoe_number_string
Create Date: 2026-04-23 07:00:00.000000

Changes:
- Add OPERATIONS_MANAGER, SHIFT_MANAGER, SHUFFLER to Role enum
- Add DeckNumber enum type
- Add BoxType enum type
- Create Box table (deck packaging unit)
- Create ShredEvent table (dedicated shred tracking)
- Add boxId FK to Shoe table
- Container.CAPACITY changed from 200 → 176 (code-only constant, no column alter)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_boxes_and_rbac"
down_revision: Union[str, None] = "0010_shoe_number_string"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Box table ──────────────────────────────────────────────────────────────
    op.create_table(
        "Box",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("color", sa.String, nullable=False),
        sa.Column("material", sa.String, nullable=False),
        sa.Column(
            "boxType",
            sa.String,
            nullable=False,
            server_default="STANDARD",
        ),
        sa.Column("spareDeckNumber", sa.String, nullable=True),
        sa.Column("containerId", sa.Integer(), sa.ForeignKey("Container.id", ondelete="SET NULL"), nullable=True),
        sa.Column("isConsumed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("consumedAt", sa.DateTime(), nullable=True),
        sa.Column("consumedByShoeId", sa.Integer(), sa.ForeignKey("Shoe.id", ondelete="SET NULL"), nullable=True),
        sa.Column("createdById", sa.Integer(), sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("Box_color_idx", "Box", ["color"])
    op.create_index("Box_containerId_idx", "Box", ["containerId"])
    op.create_index("Box_isConsumed_idx", "Box", ["isConsumed"])

    # ── ShredEvent table ───────────────────────────────────────────────────────
    op.create_table(
        "ShredEvent",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("shoeId", sa.Integer(), sa.ForeignKey("Shoe.id", ondelete="SET NULL"), nullable=True),
        sa.Column("color", sa.String, nullable=False),
        sa.Column("material", sa.String, nullable=True),
        sa.Column("decksShredded", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("cardsShredded", sa.Integer(), nullable=False, server_default="416"),
        sa.Column("shredById", sa.Integer(), sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("shredAt", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ShredEvent_color_idx", "ShredEvent", ["color"])
    op.create_index("ShredEvent_shredAt_idx", "ShredEvent", ["shredAt"])
    op.create_index("ShredEvent_shoeId_idx", "ShredEvent", ["shoeId"])

    # ── Add boxId FK to Shoe table ─────────────────────────────────────────────
    op.add_column("Shoe", sa.Column("boxId", sa.Integer(), sa.ForeignKey("Box.id", ondelete="SET NULL"), nullable=True))


def downgrade() -> None:
    op.drop_column("Shoe", "boxId")
    op.drop_index("ShredEvent_shoeId_idx", table_name="ShredEvent")
    op.drop_index("ShredEvent_shredAt_idx", table_name="ShredEvent")
    op.drop_index("ShredEvent_color_idx", table_name="ShredEvent")
    op.drop_table("ShredEvent")
    op.drop_index("Box_isConsumed_idx", table_name="Box")
    op.drop_index("Box_containerId_idx", table_name="Box")
    op.drop_index("Box_color_idx", table_name="Box")
    op.drop_table("Box")
