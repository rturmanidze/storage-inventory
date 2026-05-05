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

revision: str = "0015_deck_type_cutting_cards"
down_revision: Union[str, Sequence[str], None] = "0014_merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Add deckType column to Container (nullable for backward compat) ───────
    op.add_column(
        "Container",
        sa.Column(
            "deckType",
            sa.String,
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
            sa.String,
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
            sa.String,
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
