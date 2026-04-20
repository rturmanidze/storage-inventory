"""Container-based deck storage: CardMaterial enum, Container, ContainerEvent tables

Revision ID: 0008_containers
Revises: 0007_shoe_refill
Create Date: 2026-04-20 14:00:00.000000

Changes:
- Adds CardMaterial enum (PLASTIC / PAPER).
- Adds ContainerEventType enum.
- Adds Container table (FIFO deck containers, 200 decks each).
- Adds ContainerEvent table (full audit trail per container).
- Adds material column (nullable) to DeckEntry.
- Adds containerId FK (nullable) to Shoe.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_containers"
down_revision: Union[str, None] = "0007_shoe_refill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE … ADD VALUE to run outside a transaction.
    bind = op.get_bind()
    bind.execute(sa.text("COMMIT"))

    # New enum: CardMaterial
    bind.execute(sa.text(
        "DO $$ BEGIN "
        "  CREATE TYPE \"CardMaterial\" AS ENUM ('PLASTIC', 'PAPER'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; "
        "END $$"
    ))

    # New enum: ContainerEventType
    bind.execute(sa.text(
        "DO $$ BEGIN "
        "  CREATE TYPE \"ContainerEventType\" AS ENUM "
        "  ('CREATED', 'LOCKED', 'UNLOCKED', 'DECK_CONSUMED', 'ARCHIVED'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; "
        "END $$"
    ))

    # Container table
    op.create_table(
        "Container",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("code", sa.String, nullable=False, unique=True),
        sa.Column("color", postgresql.ENUM("BLACK", "RED", name="CardColor", create_type=False), nullable=False),
        sa.Column(
            "material",
            postgresql.ENUM("PLASTIC", "PAPER", name="CardMaterial", create_type=False),
            nullable=False,
        ),
        sa.Column("decksRemaining", sa.Integer, nullable=False, server_default="200"),
        sa.Column("isLocked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("createdById", sa.Integer, sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("lockedAt", sa.DateTime, nullable=True),
        sa.Column("unlockedAt", sa.DateTime, nullable=True),
        sa.Column("archivedAt", sa.DateTime, nullable=True),
    )
    op.create_index("Container_color_idx", "Container", ["color"])
    op.create_index("Container_archivedAt_idx", "Container", ["archivedAt"])

    # ContainerEvent table
    op.create_table(
        "ContainerEvent",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("containerId", sa.Integer, sa.ForeignKey("Container.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "eventType",
            postgresql.ENUM(
                "CREATED", "LOCKED", "UNLOCKED", "DECK_CONSUMED", "ARCHIVED",
                name="ContainerEventType",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("decksConsumed", sa.Integer, nullable=True),
        sa.Column("shoeId", sa.Integer, sa.ForeignKey("Shoe.id", ondelete="SET NULL"), nullable=True),
        sa.Column("userId", sa.Integer, sa.ForeignKey("User.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ContainerEvent_containerId_idx", "ContainerEvent", ["containerId"])

    # material column on DeckEntry (nullable for backward compat)
    op.add_column(
        "DeckEntry",
        sa.Column(
            "material",
            postgresql.ENUM("PLASTIC", "PAPER", name="CardMaterial", create_type=False),
            nullable=True,
        ),
    )

    # containerId FK on Shoe (nullable — not all shoes sourced from a container)
    op.add_column(
        "Shoe",
        sa.Column(
            "containerId",
            sa.Integer,
            sa.ForeignKey("Container.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("Shoe", "containerId")
    op.drop_column("DeckEntry", "material")
    op.drop_index("ContainerEvent_containerId_idx", table_name="ContainerEvent")
    op.drop_table("ContainerEvent")
    op.drop_index("Container_archivedAt_idx", table_name="Container")
    op.drop_index("Container_color_idx", table_name="Container")
    op.drop_table("Container")
    # Note: PostgreSQL does not support dropping enum types easily when in use.
    # The enums CardMaterial and ContainerEventType are left in place on downgrade.
