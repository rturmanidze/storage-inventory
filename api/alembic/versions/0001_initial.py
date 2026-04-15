"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- enum types ---
    op.execute("CREATE TYPE IF NOT EXISTS \"Role\" AS ENUM ('ADMIN', 'MANAGER', 'VIEWER')")
    op.execute("CREATE TYPE IF NOT EXISTS \"UnitStatus\" AS ENUM ('IN_STOCK', 'ISSUED', 'QUARANTINED', 'SCRAPPED')")
    op.execute("CREATE TYPE IF NOT EXISTS \"MovementType\" AS ENUM ('RECEIVE', 'TRANSFER', 'ISSUE', 'RETURN', 'ADJUST')")
    op.execute("CREATE TYPE IF NOT EXISTS \"IssuedToType\" AS ENUM ('PERSON', 'DEPARTMENT', 'CUSTOMER')")

    # --- User ---
    op.create_table(
        "User",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String, nullable=False, unique=True),
        sa.Column("email", sa.String, nullable=False, unique=True),
        sa.Column("passwordHash", sa.String, nullable=False),
        sa.Column(
            "role",
            sa.Enum("ADMIN", "MANAGER", "VIEWER", name="Role", create_type=False),
            nullable=False,
            server_default="VIEWER",
        ),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("updatedAt", sa.DateTime, nullable=False),
    )

    # --- Warehouse ---
    op.create_table(
        "Warehouse",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("code", sa.String, nullable=False, unique=True),
        sa.Column("name", sa.String, nullable=False, unique=True),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("updatedAt", sa.DateTime, nullable=False),
    )

    # --- Location ---
    op.create_table(
        "Location",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("warehouseId", sa.Integer, sa.ForeignKey("Warehouse.id"), nullable=False),
        sa.Column("code", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("updatedAt", sa.DateTime, nullable=False),
        sa.UniqueConstraint("warehouseId", "code", name="Location_warehouseId_code_key"),
    )

    # --- Item ---
    op.create_table(
        "Item",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("sku", sa.String, nullable=False, unique=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String, nullable=True),
        sa.Column("supplier", sa.String, nullable=True),
        sa.Column("batch", sa.String, nullable=True),
        sa.Column("unit", sa.String, nullable=False, server_default="pcs"),
        sa.Column("minStock", sa.Integer, nullable=False, server_default="0"),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("updatedAt", sa.DateTime, nullable=False),
    )

    # --- ItemBarcode ---
    op.create_table(
        "ItemBarcode",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "itemId",
            sa.Integer,
            sa.ForeignKey("Item.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("value", sa.String, nullable=False),
        sa.Column("createdAt", sa.DateTime, nullable=False),
    )
    op.create_index("ItemBarcode_value_idx", "ItemBarcode", ["value"])

    # --- IssuedTo ---
    op.create_table(
        "IssuedTo",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column(
            "type",
            sa.Enum("PERSON", "DEPARTMENT", "CUSTOMER", name="IssuedToType", create_type=False),
            nullable=False,
            server_default="PERSON",
        ),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("updatedAt", sa.DateTime, nullable=False),
    )

    # --- SerializedUnit ---
    op.create_table(
        "SerializedUnit",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("itemId", sa.Integer, sa.ForeignKey("Item.id"), nullable=False),
        sa.Column("serial", sa.String, nullable=False, unique=True),
        sa.Column(
            "status",
            sa.Enum("IN_STOCK", "ISSUED", "QUARANTINED", "SCRAPPED", name="UnitStatus", create_type=False),
            nullable=False,
            server_default="IN_STOCK",
        ),
        sa.Column(
            "currentLocationId",
            sa.Integer,
            sa.ForeignKey("Location.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("updatedAt", sa.DateTime, nullable=False),
    )

    # --- Movement ---
    op.create_table(
        "Movement",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "type",
            sa.Enum("RECEIVE", "TRANSFER", "ISSUE", "RETURN", "ADJUST", name="MovementType", create_type=False),
            nullable=False,
        ),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("createdAt", sa.DateTime, nullable=False),
        sa.Column("createdById", sa.Integer, sa.ForeignKey("User.id"), nullable=False),
    )

    # --- MovementLine ---
    op.create_table(
        "MovementLine",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("movementId", sa.Integer, sa.ForeignKey("Movement.id"), nullable=False),
        sa.Column("serialUnitId", sa.Integer, sa.ForeignKey("SerializedUnit.id"), nullable=False),
        sa.Column(
            "fromLocationId",
            sa.Integer,
            sa.ForeignKey("Location.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "toLocationId",
            sa.Integer,
            sa.ForeignKey("Location.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "issuedToId",
            sa.Integer,
            sa.ForeignKey("IssuedTo.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("MovementLine")
    op.drop_table("Movement")
    op.drop_table("SerializedUnit")
    op.drop_table("IssuedTo")
    op.drop_index("ItemBarcode_value_idx", table_name="ItemBarcode")
    op.drop_table("ItemBarcode")
    op.drop_table("Item")
    op.drop_table("Location")
    op.drop_table("Warehouse")
    op.drop_table("User")
    op.execute('DROP TYPE "IssuedToType"')
    op.execute('DROP TYPE "MovementType"')
    op.execute('DROP TYPE "UnitStatus"')
    op.execute('DROP TYPE "Role"')
