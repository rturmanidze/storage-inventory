"""Add Box model, ShredEvent, new roles, update Container capacity"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_boxes_and_rbac"
down_revision: Union[str, None] = "0010_shoe_number_string"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─────────────────────────────────────────────
    # ROLE UPDATE
    # ─────────────────────────────────────────────
    with op.get_context().autocommit_block():
        op.execute(sa.text("""
            ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OPERATIONS_MANAGER'
        """))
        op.execute(sa.text("""
            ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SHIFT_MANAGER'
        """))
        op.execute(sa.text("""
            ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SHUFFLER'
        """))

    # ─────────────────────────────────────────────
    # BOX TABLE
    # ─────────────────────────────────────────────
    op.create_table(
        "Box",
        sa.Column("id", sa.Integer(), primary_key=True),

        # COLOR
        sa.Column("color", sa.String(), nullable=False),
        sa.CheckConstraint(
            "color IN ('BLACK','RED')",
            name="ck_box_color"
        ),

        # MATERIAL
        sa.Column("material", sa.String(), nullable=False),
        sa.CheckConstraint(
            "material IN ('PLASTIC','PAPER')",
            name="ck_box_material"
        ),

        # BOX TYPE
        sa.Column("boxType", sa.String(), nullable=False, server_default="STANDARD"),
        sa.CheckConstraint(
            "boxType IN ('STANDARD','SPARE','CUTTING_CARD')",
            name="ck_box_type"
        ),

        # DECK NUMBER
        sa.Column("spareDeckNumber", sa.String(), nullable=True),
        sa.CheckConstraint(
            "spareDeckNumber IN ('DECK1','DECK2','DECK3','DECK4','DECK5','DECK6','DECK7','DECK8')",
            name="ck_box_deck_number"
        ),

        sa.Column(
            "containerId",
            sa.Integer(),
            sa.ForeignKey("Container.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column("isConsumed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("consumedAt", sa.DateTime(), nullable=True),

        sa.Column(
            "consumedByShoeId",
            sa.Integer(),
            sa.ForeignKey("Shoe.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column(
            "createdById",
            sa.Integer(),
            sa.ForeignKey("User.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_index("idx_box_color", "Box", ["color"])
    op.create_index("idx_box_container", "Box", ["containerId"])
    op.create_index("idx_box_consumed", "Box", ["isConsumed"])

    # ─────────────────────────────────────────────
    # SHRED EVENT TABLE
    # ─────────────────────────────────────────────
    op.create_table(
        "ShredEvent",
        sa.Column("id", sa.Integer(), primary_key=True),

        sa.Column(
            "shoeId",
            sa.Integer(),
            sa.ForeignKey("Shoe.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column("color", sa.String(), nullable=False),
        sa.CheckConstraint(
            "color IN ('BLACK','RED')",
            name="ck_shred_color"
        ),

        sa.Column("material", sa.String(), nullable=True),
        sa.CheckConstraint(
            "material IN ('PLASTIC','PAPER')",
            name="ck_shred_material"
        ),

        sa.Column("decksShredded", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("cardsShredded", sa.Integer(), nullable=False, server_default="416"),

        sa.Column(
            "shredById",
            sa.Integer(),
            sa.ForeignKey("User.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("shredAt", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_index("idx_shred_color", "ShredEvent", ["color"])
    op.create_index("idx_shred_date", "ShredEvent", ["shredAt"])
    op.create_index("idx_shred_shoe", "ShredEvent", ["shoeId"])

    # ─────────────────────────────────────────────
    # ADD COLUMN TO SHOE
    # ─────────────────────────────────────────────
    op.add_column(
        "Shoe",
        sa.Column(
            "boxId",
            sa.Integer(),
            sa.ForeignKey("Box.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("Shoe", "boxId")

    op.drop_index("idx_shred_shoe", table_name="ShredEvent")
    op.drop_index("idx_shred_date", table_name="ShredEvent")
    op.drop_index("idx_shred_color", table_name="ShredEvent")
    op.drop_table("ShredEvent")

    op.drop_index("idx_box_consumed", table_name="Box")
    op.drop_index("idx_box_container", table_name="Box")
    op.drop_index("idx_box_color", table_name="Box")
    op.drop_table("Box")
