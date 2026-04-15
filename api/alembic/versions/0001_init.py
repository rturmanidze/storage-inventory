"""initial schema

Revision ID: 0001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE "UnitStatus" AS ENUM ('IN_STOCK', 'ISSUED', 'QUARANTINED', 'SCRAPPED');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE "MovementType" AS ENUM ('RECEIVE', 'TRANSFER', 'ISSUE', 'RETURN', 'ADJUST');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE "IssuedToType" AS ENUM ('PERSON', 'DEPARTMENT', 'CUSTOMER');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "User" (
            "id"           SERIAL PRIMARY KEY,
            "username"     TEXT NOT NULL,
            "email"        TEXT NOT NULL,
            "passwordHash" TEXT NOT NULL,
            "role"         "Role" NOT NULL DEFAULT 'VIEWER',
            "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT "User_username_key" UNIQUE ("username"),
            CONSTRAINT "User_email_key" UNIQUE ("email")
        );
    """)

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
        CREATE TABLE IF NOT EXISTS "SerializedUnit" (
            "id"                SERIAL PRIMARY KEY,
            "itemId"            INTEGER NOT NULL REFERENCES "Item"("id"),
            "serial"            TEXT NOT NULL,
            "status"            "UnitStatus" NOT NULL DEFAULT 'IN_STOCK',
            "currentLocationId" INTEGER REFERENCES "Location"("id") ON DELETE SET NULL,
            "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT "SerializedUnit_serial_key" UNIQUE ("serial")
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "IssuedTo" (
            "id"        SERIAL PRIMARY KEY,
            "name"      TEXT NOT NULL,
            "type"      "IssuedToType" NOT NULL DEFAULT 'PERSON',
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS "Movement" (
            "id"          SERIAL PRIMARY KEY,
            "type"        "MovementType" NOT NULL,
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
    op.execute('DROP TABLE IF EXISTS "IssuedTo" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "SerializedUnit" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "ItemBarcode" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "Item" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "Location" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "Warehouse" CASCADE;')
    op.execute('DROP TABLE IF EXISTS "User" CASCADE;')
    op.execute('DROP TYPE IF EXISTS "MovementType";')
    op.execute('DROP TYPE IF EXISTS "IssuedToType";')
    op.execute('DROP TYPE IF EXISTS "UnitStatus";')
    op.execute('DROP TYPE IF EXISTS "Role";')
