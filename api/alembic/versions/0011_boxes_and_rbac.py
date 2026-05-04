from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_boxes_and_rbac"
down_revision: Union[str, None] = "0010_shoe_number_string"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Role ENUM update ──────────────────────────────────────
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

    # ── ENUM create ONLY IF NOT EXISTS ────────────────────────
    op.execute("""
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decknumber') THEN
            CREATE TYPE "DeckNumber" AS ENUM (
                'DECK1','DECK2','DECK3','DECK4','DECK5','DECK6','DECK7','DECK8'
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

    # ── Box table ─────────────────────────────────────────────
    op.create_table(
        "Box",
        sa.Column("id", sa.Integer(), primary_key=True),

        sa.Column(
            "color",
            sa.Enum("BLACK", "RED", name="CardColor", create_type=False),
            nullable=False
        ),

        sa.Column(
            "material",
            sa.Enum("PLASTIC", "PAPER", name="CardMaterial", create_type=False),
            nullable=False
        ),

        sa.Column(
            "boxType",
            sa.Enum("STANDARD", "SPARE", "CUTTING_CARD", name="BoxType", create_type=False),
            nullable=False,
            server_default="STANDARD"
        ),

        sa.Column(
            "spareDeckNumber",
            sa.Enum(
                "DECK1","DECK2","DECK3","DECK4",
                "DECK5","DECK6","DECK7","DECK8",
                name="DeckNumber",
                create_type=False
            ),
            nullable=True
        ),

        sa.Column("containerId", sa.Integer(), sa.ForeignKey("Container.id")),
        sa.Column("isConsumed", sa.Boolean(), server_default="false"),
        sa.Column("consumedAt", sa.DateTime()),

        sa.Column("consumedByShoeId", sa.Integer(), sa.ForeignKey("Shoe.id")),
        sa.Column("createdById", sa.Integer(), sa.ForeignKey("User.id")),

        sa.Column("createdAt", sa.DateTime(), server_default=sa.text("NOW()")),
    )

    # ── ShredEvent table ──────────────────────────────────────
    op.create_table(
        "ShredEvent",
        sa.Column("id", sa.Integer(), primary_key=True),

        sa.Column("shoeId", sa.Integer(), sa.ForeignKey("Shoe.id")),

        sa.Column(
            "color",
            sa.Enum("BLACK", "RED", name="CardColor", create_type=False),
            nullable=False
        ),

        sa.Column(
            "material",
            sa.Enum("PLASTIC", "PAPER", name="CardMaterial", create_type=False),
        ),

        sa.Column("decksShredded", sa.Integer(), server_default="8"),
        sa.Column("cardsShredded", sa.Integer(), server_default="416"),

        sa.Column("shredById", sa.Integer(), sa.ForeignKey("User.id")),
        sa.Column("note", sa.Text()),
        sa.Column("shredAt", sa.DateTime(), server_default=sa.text("NOW()")),
    )

    # ── FK to Shoe ────────────────────────────────────────────
    op.add_column(
        "Shoe",
        sa.Column("boxId", sa.Integer(), sa.ForeignKey("Box.id"))
    )


def downgrade() -> None:
    op.drop_column("Shoe", "boxId")

    op.drop_table("ShredEvent")
    op.drop_table("Box")

    # ⚠️ ENUM-ები არ ვშლით — უკვე გამოიყენება სხვა ადგილებში
