import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Enum as SAEnum,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    VIEWER = "VIEWER"


class UnitStatus(str, enum.Enum):
    IN_STOCK = "IN_STOCK"
    ISSUED = "ISSUED"
    QUARANTINED = "QUARANTINED"
    SCRAPPED = "SCRAPPED"


class MovementType(str, enum.Enum):
    RECEIVE = "RECEIVE"
    TRANSFER = "TRANSFER"
    ISSUE = "ISSUE"
    RETURN = "RETURN"
    ADJUST = "ADJUST"


class IssuedToType(str, enum.Enum):
    PERSON = "PERSON"
    DEPARTMENT = "DEPARTMENT"
    CUSTOMER = "CUSTOMER"


class User(Base):
    __tablename__ = "User"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    passwordHash = Column(String, nullable=False)
    role = Column(SAEnum(Role, name="Role", create_type=False), nullable=False, default=Role.VIEWER)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    movements = relationship("Movement", back_populates="createdBy")


class Warehouse(Base):
    __tablename__ = "Warehouse"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, unique=True, nullable=False)
    address = Column(Text, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    locations = relationship("Location", back_populates="warehouse")


class Location(Base):
    __tablename__ = "Location"

    id = Column(Integer, primary_key=True, autoincrement=True)
    warehouseId = Column(Integer, ForeignKey("Warehouse.id"), nullable=False)
    code = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    warehouse = relationship("Warehouse", back_populates="locations")
    units = relationship("SerializedUnit", back_populates="currentLocation")
    fromLines = relationship(
        "MovementLine",
        foreign_keys="MovementLine.fromLocationId",
        back_populates="fromLocation",
    )
    toLines = relationship(
        "MovementLine",
        foreign_keys="MovementLine.toLocationId",
        back_populates="toLocation",
    )

    __table_args__ = (UniqueConstraint("warehouseId", "code", name="Location_warehouseId_code_key"),)


class Item(Base):
    __tablename__ = "Item"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    supplier = Column(String, nullable=True)
    batch = Column(String, nullable=True)
    unit = Column(String, nullable=False, default="pcs")
    minStock = Column(Integer, nullable=False, default=0)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    barcodes = relationship("ItemBarcode", back_populates="item", cascade="all, delete-orphan")
    units = relationship("SerializedUnit", back_populates="item")


class ItemBarcode(Base):
    __tablename__ = "ItemBarcode"

    id = Column(Integer, primary_key=True, autoincrement=True)
    itemId = Column(Integer, ForeignKey("Item.id", ondelete="CASCADE"), nullable=False)
    value = Column(String, nullable=False)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    item = relationship("Item", back_populates="barcodes")

    __table_args__ = (Index("ItemBarcode_value_idx", "value"),)


class SerializedUnit(Base):
    __tablename__ = "SerializedUnit"

    id = Column(Integer, primary_key=True, autoincrement=True)
    itemId = Column(Integer, ForeignKey("Item.id"), nullable=False)
    serial = Column(String, unique=True, nullable=False)
    status = Column(
        SAEnum(UnitStatus, name="UnitStatus", create_type=False),
        nullable=False,
        default=UnitStatus.IN_STOCK,
    )
    currentLocationId = Column(Integer, ForeignKey("Location.id", ondelete="SET NULL"), nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    item = relationship("Item", back_populates="units")
    currentLocation = relationship("Location", back_populates="units")
    movementLines = relationship("MovementLine", back_populates="serialUnit")


class IssuedTo(Base):
    __tablename__ = "IssuedTo"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    type = Column(
        SAEnum(IssuedToType, name="IssuedToType", create_type=False),
        nullable=False,
        default=IssuedToType.PERSON,
    )
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    movementLines = relationship("MovementLine", back_populates="issuedTo")


class Movement(Base):
    __tablename__ = "Movement"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(SAEnum(MovementType, name="MovementType", create_type=False), nullable=False)
    note = Column(Text, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    createdById = Column(Integer, ForeignKey("User.id"), nullable=False)

    createdBy = relationship("User", back_populates="movements")
    lines = relationship("MovementLine", back_populates="movement")


class MovementLine(Base):
    __tablename__ = "MovementLine"

    id = Column(Integer, primary_key=True, autoincrement=True)
    movementId = Column(Integer, ForeignKey("Movement.id"), nullable=False)
    serialUnitId = Column(Integer, ForeignKey("SerializedUnit.id"), nullable=False)
    fromLocationId = Column(Integer, ForeignKey("Location.id", ondelete="SET NULL"), nullable=True)
    toLocationId = Column(Integer, ForeignKey("Location.id", ondelete="SET NULL"), nullable=True)
    issuedToId = Column(Integer, ForeignKey("IssuedTo.id", ondelete="SET NULL"), nullable=True)

    movement = relationship("Movement", back_populates="lines")
    serialUnit = relationship("SerializedUnit", back_populates="movementLines")
    fromLocation = relationship(
        "Location",
        foreign_keys=[fromLocationId],
        back_populates="fromLines",
    )
    toLocation = relationship(
        "Location",
        foreign_keys=[toLocationId],
        back_populates="toLines",
    )
    issuedTo = relationship("IssuedTo", back_populates="movementLines")
