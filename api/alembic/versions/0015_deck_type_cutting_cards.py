"""Add deck_type to Container, CuttingCardContainer, CuttingCardEvent, ShoeContainerLink

Revision ID: 0015_deck_type_cutting_cards
Revises: 0014_merge_heads
Create Date: 2026-05-04 10:00:00.000000

Changes:
- Add deckType column (nullable) to Container table
- Create CuttingCardEventType enum
- Create CuttingCardContainer table
- Create CuttingCardEvent table
- Create ShoeContainerLink table
- Add cuttingCardContainerId FK to Shoe table
- Add Container_deckType_idx index
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_deck_type_cutting_cards"
down_revision: Union[str, Sequence[str], None] = "0014_merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── CuttingCardEventType enum ─────────────────────────────────────────────
    # CREATE TYPE is transactional DDL in PostgreSQL — no autocommit needed.
    # This matches the pattern used in migration 0011 for DeckNumber/BoxType.
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "CuttingCardEventType" AS ENUM (
                'CREATED', 'DEDUCTED', 'REPLACED', 'QUANTITY_ADJUSTED'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """))

    # ── Add deckType column to Container (nullable for backward compat) ───────
    op.add_column(
        "Container",
        sa.Column(
            "deckType",
            postgresql.ENUM("DECK1", "DECK2", "DECK3", "DECK4", "DECK5", "DECK6", "DECK7", "DECK8", name="DeckNumber", create_type=False),
            nullable=True,
        ),
    )
    op.create_index("Container_deckType_idx", "Container", ["deckType"])

    # ── CuttingCardContainer table ────────────────────────────────────────────
    op.create_table(
        "CuttingCardContainer",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(), unique=True, nullable=False),
        sa.Column("totalCards", sa.Integer(), nullable=False),
        sa.Column("availableCards", sa.Integer(), nullable=False),
        sa.Column("isLocked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("createdById", sa.Integer(), sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("lockedAt", sa.DateTime(), nullable=True),
        sa.Column("unlockedAt", sa.DateTime(), nullable=True),
        sa.Column("archivedAt", sa.DateTime(), nullable=True),
    )
    op.create_index("CuttingCardContainer_archivedAt_idx", "CuttingCardContainer", ["archivedAt"])

    # ── CuttingCardEvent table ────────────────────────────────────────────────
    op.create_table(
        "CuttingCardEvent",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "containerId",
            sa.Integer(),
            sa.ForeignKey("CuttingCardContainer.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "eventType",
            postgresql.ENUM(
                "CREATED", "DEDUCTED", "REPLACED", "QUANTITY_ADJUSTED",
                name="CuttingCardEventType",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("cardsChanged", sa.Integer(), nullable=True),
        sa.Column("shoeId", sa.Integer(), sa.ForeignKey("Shoe.id", ondelete="SET NULL"), nullable=True),
        sa.Column("userId", sa.Integer(), sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    # ── ShoeContainerLink table ───────────────────────────────────────────────
    op.create_table(
        "ShoeContainerLink",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("shoeId", sa.Integer(), sa.ForeignKey("Shoe.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "containerId",
            sa.Integer(),
            sa.ForeignKey("Container.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "deckType",
            postgresql.ENUM("DECK1", "DECK2", "DECK3", "DECK4", "DECK5", "DECK6", "DECK7", "DECK8", name="DeckNumber", create_type=False),
            nullable=False,
        ),
        sa.Column("decksConsumed", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("shoeId", "deckType", name="ShoeContainerLink_shoeId_deckType_key"),
    )
    op.create_index("ShoeContainerLink_shoeId_idx", "ShoeContainerLink", ["shoeId"])

    # ── Add cuttingCardContainerId FK to Shoe ─────────────────────────────────
    op.add_column(
        "Shoe",
        sa.Column(
            "cuttingCardContainerId",
            sa.Integer(),
            sa.ForeignKey("CuttingCardContainer.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("Shoe", "cuttingCardContainerId")
    op.drop_index("ShoeContainerLink_shoeId_idx", table_name="ShoeContainerLink")
    op.drop_table("ShoeContainerLink")
    op.drop_table("CuttingCardEvent")
    op.drop_index("CuttingCardContainer_archivedAt_idx", table_name="CuttingCardContainer")
    op.drop_table("CuttingCardContainer")
    op.drop_index("Container_deckType_idx", table_name="Container")
    op.drop_column("Container", "deckType")
    op.execute(sa.text('DROP TYPE IF EXISTS "CuttingCardEventType"'))
