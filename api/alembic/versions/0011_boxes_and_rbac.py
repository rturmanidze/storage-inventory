"""Add Box model, ShredEvent, new roles, update Container capacity"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_boxes_and_rbac"
down_revision: Union[str, None] = "0010_shoe_number_string"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ✅ IMPORTANT: NO SQLAlchemy ENUM objects here
# We will use TEXT + explicit TYPE CAST


def upgrade() -> None:
    # ── Role updates ───────────────────────────────────────────
    with op.get_context().autocommit_block():
        op.execute(sa.text(
            "ALTER TYPE \"Role\" ADD VALUE IF NOT EXISTS 'OPERATIONS_MANAGER'"
        ))
        op.execute(sa.text(
            "ALTER TYPE \"Role\" ADD VALUE IF NOT EXISTS 'SHIFT_MANAGER'"
        ))
        op.execute(sa.text(
            "ALTER TYPE \"Role\" ADD VALUE IF NOT EXISTS 'SHUFFLER'"
        ))

    # ── Ensure ENUMs exist (SAFE) ───────────────────────────────
    op.execute("""
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decknumber') THEN
            CREATE TYPE "DeckNumber" AS ENUM (
                'DECK1','DECK2','DECK3','DECK4',
                'DECK5','DECK6','DECK7','DECK8'
            );
        END IF;
    END $$;
    """)

    op.execute("""
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'boxtype') THEN
            CREATE TYPE "BoxType" AS ENUM (
                'STANDARD','SPARE','CUTTING_CARD'
            );
        END IF;
    END $$;
    """)

    # ── Box table ──────────────────────────────────────────────
    op.create_table(
        "Box",
        sa.Column("id", sa.Integer(), primary_key=True),

        # ❗ TEXT + CAST → prevents SQLAlchemy from creating ENUM again
        sa.Column("color", sa.Text(), nullable=False),
        sa.Column("material", sa.Text(), nullable=False),

        sa.Column(
            "boxType",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'STANDARD'::\"BoxType\""),
        ),

        sa.Column(
            "spareDeckNumber",
            sa.Text(),
            nullable=True,
        ),

        sa.Column(
            "containerId",
            sa.Integer(),
            sa.ForeignKey("Container.id", ondelete="SET NULL"),
        ),

        sa.Column(
            "isConsumed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),

        sa.Column("consumedAt", sa.DateTime()),

        sa.Column(
            "consumedByShoeId",
            sa.Integer(),
            sa.ForeignKey("Shoe.id", ondelete="SET NULL"),
        ),

        sa.Column(
            "createdById",
            sa.Integer(),
            sa.ForeignKey("User.id", ondelete="SET NULL"),
        ),

        sa.Column(
            "createdAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # 🔥 convert TEXT → ENUM safely
    op.execute('ALTER TABLE "Box" ALTER COLUMN "color" TYPE "CardColor" USING "color"::"CardColor"')
    op.execute('ALTER TABLE "Box" ALTER COLUMN "material" TYPE "CardMaterial" USING "material"::"CardMaterial"')
    op.execute('ALTER TABLE "Box" ALTER COLUMN "boxType" TYPE "BoxType" USING "boxType"::"BoxType"')
    op.execute('ALTER TABLE "Box" ALTER COLUMN "spareDeckNumber" TYPE "DeckNumber" USING "spareDeckNumber"::"DeckNumber"')

    op.create_index("Box_color_idx", "Box", ["color"])
    op.create_index("Box_containerId_idx", "Box", ["containerId"])
    op.create_index("Box_isConsumed_idx", "Box", ["isConsumed"])

    # ── ShredEvent table ───────────────────────────────────────
    op.create_table(
        "ShredEvent",
        sa.Column("id", sa.Integer(), primary_key=True),

        sa.Column(
            "shoeId",
            sa.Integer(),
            sa.ForeignKey("Shoe.id", ondelete="SET NULL"),
        ),

        sa.Column("color", sa.Text(), nullable=False),
        sa.Column("material", sa.Text()),

        sa.Column(
            "decksShredded",
            sa.Integer(),
            nullable=False,
            server_default="8",
        ),

        sa.Column(
            "cardsShredded",
            sa.Integer(),
            nullable=False,
            server_default="416",
        ),

        sa.Column(
            "shredById",
            sa.Integer(),
            sa.ForeignKey("User.id", ondelete="SET NULL"),
        ),

        sa.Column("note", sa.Text()),

        sa.Column(
            "shredAt",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # 🔥 convert TEXT → ENUM
    op.execute('ALTER TABLE "ShredEvent" ALTER COLUMN "color" TYPE "CardColor" USING "color"::"CardColor"')
    op.execute('ALTER TABLE "ShredEvent" ALTER COLUMN "material" TYPE "CardMaterial" USING "material"::"CardMaterial"')

    op.create_index("ShredEvent_color_idx", "ShredEvent", ["color"])
    op.create_index("ShredEvent_shredAt_idx", "ShredEvent", ["shredAt"])
    op.create_index("ShredEvent_shoeId_idx", "ShredEvent", ["shoeId"])

    # ── Add FK to Shoe ─────────────────────────────────────────
    op.add_column(
        "Shoe",
        sa.Column(
            "boxId",
            sa.Integer(),
            sa.ForeignKey("Box.id", ondelete="SET NULL"),
        ),
    )


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
