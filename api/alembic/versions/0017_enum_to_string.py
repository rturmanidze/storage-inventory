"""Convert all PostgreSQL ENUM columns to VARCHAR

Revision ID: 0017_enum_to_string
Revises: 0016_boxtype_add_cutting_card
Create Date: 2026-05-05 06:00:00.000000

Changes:
- Converts every ENUM-typed column in the schema to plain VARCHAR.
- Drops all PostgreSQL ENUM types that are no longer needed.

Safe to run on databases that already have VARCHAR columns (the ALTER is a
no-op in that case) and on databases that still have ENUM columns.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_enum_to_string"
down_revision: Union[str, Sequence[str], None] = "0016_boxtype_add_cutting_card"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All (table, column) pairs that were previously backed by a PostgreSQL ENUM type.
_ENUM_COLUMNS = [
    ("User", "role"),
    ("SerializedUnit", "status"),
    ("IssuedTo", "type"),
    ("Movement", "type"),
    ("DeckEntry", "color"),
    ("DeckEntry", "material"),
    ("Container", "color"),
    ("Container", "material"),
    ("Container", "deckType"),
    ("Box", "color"),
    ("Box", "material"),
    ("Box", "boxType"),
    ("Box", "spareDeckNumber"),
    ("ShredEvent", "color"),
    ("ShredEvent", "material"),
    ("ContainerEvent", "eventType"),
    ("CuttingCardEvent", "eventType"),
    ("Shoe", "color"),
    ("Shoe", "material"),
    ("Shoe", "status"),
    ("ShoeContainerLink", "deckType"),
]

# All PostgreSQL ENUM types introduced across migrations 0001–0016.
_ENUM_TYPES = [
    "Role",
    "UnitStatus",
    "MovementType",
    "IssuedToType",
    "CardColor",
    "CardMaterial",
    "ShoeStatus",
    "ContainerEventType",
    "DeckNumber",
    "BoxType",
    "CuttingCardEventType",
]


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        # This migration is PostgreSQL-specific (USING col::text and DROP TYPE).
        return
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())

    # Convert every ENUM column to VARCHAR.  Using USING col::text makes the
    # cast explicit and works regardless of whether the column is already VARCHAR.
    for table, column in _ENUM_COLUMNS:
        if table not in tables:
            continue
        columns = {col["name"] for col in inspector.get_columns(table)}
        if column not in columns:
            continue
        conn.execute(sa.text(
            f'ALTER TABLE "{table}" '
            f'ALTER COLUMN "{column}" TYPE VARCHAR '
            f'USING "{column}"::text'
        ))

    # Drop the ENUM types now that no column references them.
    for type_name in _ENUM_TYPES:
        conn.execute(sa.text(f'DROP TYPE IF EXISTS "{type_name}"'))


def downgrade() -> None:
    # Downgrade intentionally left empty: recreating ENUM types and casting
    # back from VARCHAR is complex and error-prone.  Rolling back to a
    # pre-0017 state should be done via a database restore.
    pass
