"""studios and card inventory: Studio, DeckEntry, Shoe

Revision ID: 0003_studios_and_cards
Revises: 0002_enhancements
Create Date: 2026-04-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_studios_and_cards"
down_revision: Union[str, None] = "0002_enhancements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create CardColor enum (DO block guards against duplicate if migration is re-applied)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE "CardColor" AS ENUM ('BLACK', 'RED');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)
    # Create ShoeStatus enum
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE "ShoeStatus" AS ENUM ('IN_WAREHOUSE', 'SENT_TO_STUDIO');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # --- Studio ---
    op.create_table(
        "Studio",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String, nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("updatedAt", sa.DateTime, nullable=False),
    )

    # --- DeckEntry ---
    op.create_table(
        "DeckEntry",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("color", postgresql.ENUM("BLACK", "RED", name="CardColor", create_type=False), nullable=False),
        sa.Column("deckCount", sa.Integer, nullable=False),
        sa.Column("cardCount", sa.Integer, nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("createdById", sa.Integer, sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False),
    )
    op.create_index("DeckEntry_color_idx", "DeckEntry", ["color"])

    # --- Shoe ---
    op.create_table(
        "Shoe",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("color", postgresql.ENUM("BLACK", "RED", name="CardColor", create_type=False), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("IN_WAREHOUSE", "SENT_TO_STUDIO", name="ShoeStatus", create_type=False),
            nullable=False,
            server_default="IN_WAREHOUSE",
        ),
        sa.Column("studioId", sa.Integer, sa.ForeignKey("Studio.id", ondelete="SET NULL"), nullable=True),
        sa.Column("createdById", sa.Integer, sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sentById", sa.Integer, sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("sentAt", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("Shoe")
    op.drop_index("DeckEntry_color_idx", "DeckEntry")
    op.drop_table("DeckEntry")
    op.drop_table("Studio")
    op.execute("DROP TYPE IF EXISTS \"ShoeStatus\"")
    op.execute("DROP TYPE IF EXISTS \"CardColor\"")
