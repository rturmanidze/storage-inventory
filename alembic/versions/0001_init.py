"""initial schema (legacy generic WMS tables)

Revision ID: 0001
Revises: 0001_initial
Create Date: 2024-01-01 00:00:00.000000

This migration was originally the root of a generic WMS schema branch that was
never connected to the casino WMS chain.  It has been re-parented to depend on
0001_initial so that both chains converge at the merge migration 0014_merge_heads.

All tables are created with IF-NOT-EXISTS guards so re-running on an already-
migrated database is safe.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS "Warehouse" (
            "id"        SERIAL PRIMARY KEY,
            "name"      TEXT NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT "Warehouse_name_key" UNIQUE ("name")
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "Location" (
            "id"          SERIAL PRIMARY KEY,
            "warehouseId" INTEGER NOT NULL REFERENCES "Warehouse"("id"),
            "code"        TEXT NOT NULL,
            "description" TEXT,
            "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT "Location_warehouseId_code_key" UNIQUE ("warehouseId", "code")
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "Item" (
            "id"          SERIAL PRIMARY KEY,
            "sku"         TEXT NOT NULL,
            "name"        TEXT NOT NULL,
            "description" TEXT,
            "category"    TEXT,
            "supplier"    TEXT,
            "batch"       TEXT,
            "unit"        TEXT NOT NULL DEFAULT 'pcs',
            "minStock"    INTEGER NOT NULL DEFAULT 0,
            "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT "Item_sku_key" UNIQUE ("sku")
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "ItemBarcode" (
            "id"        SERIAL PRIMARY KEY,
            "itemId"    INTEGER NOT NULL REFERENCES "Item"("id") ON DELETE CASCADE,
            "value"     TEXT NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "ItemBarcode_value_idx" ON "ItemBarcode"("value");
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "IssuedTo" (
            "id"        SERIAL PRIMARY KEY,
            "name"      TEXT NOT NULL,
            "type"      TEXT NOT NULL DEFAULT 'PERSON',
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "SerializedUnit" (
            "id"                SERIAL PRIMARY KEY,
            "itemId"            INTEGER NOT NULL REFERENCES "Item"("id"),
            "serial"            TEXT NOT NULL,
            "status"            TEXT NOT NULL DEFAULT 'IN_STOCK',
            "currentLocationId" INTEGER REFERENCES "Location"("id") ON DELETE SET NULL,
            "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT "SerializedUnit_serial_key" UNIQUE ("serial")
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "Movement" (
            "id"          SERIAL PRIMARY KEY,
            "type"        TEXT NOT NULL,
            "note"        TEXT,
            "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
            "createdById" INTEGER NOT NULL REFERENCES "User"("id")
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "MovementLine" (
            "id"             SERIAL PRIMARY KEY,
            "movementId"     INTEGER NOT NULL REFERENCES "Movement"("id"),
            "serialUnitId"   INTEGER NOT NULL REFERENCES "SerializedUnit"("id"),
            "fromLocationId" INTEGER REFERENCES "Location"("id") ON DELETE SET NULL,
            "toLocationId"   INTEGER REFERENCES "Location"("id") ON DELETE SET NULL,
            "issuedToId"     INTEGER REFERENCES "IssuedTo"("id") ON DELETE SET NULL
        );
    """)


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "MovementLine" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "Movement" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "SerializedUnit" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "IssuedTo" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "ItemBarcode" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "Item" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "Location" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "Warehouse" CASCADE;')
