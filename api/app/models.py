import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
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
    OPERATIONS_MANAGER = "OPERATIONS_MANAGER"
    SHIFT_MANAGER = "SHIFT_MANAGER"
    SHUFFLER = "SHUFFLER"


class UnitStatus(str, enum.Enum):
    IN_STOCK = "IN_STOCK"
    ISSUED = "ISSUED"
    QUARANTINED = "QUARANTINED"
    SCRAPPED = "SCRAPPED"
    DAMAGED = "DAMAGED"
    EXPIRED = "EXPIRED"
    DESTROYED = "DESTROYED"


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


class AuditLog(Base):
    __tablename__ = "AuditLog"

    id = Column(Integer, primary_key=True, autoincrement=True)
    userId = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False)
    resourceType = Column(String, nullable=True)
    resourceId = Column(String, nullable=True)
    detail = Column(Text, nullable=True)
    ipAddress = Column(String, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[userId])

    __table_args__ = (
        Index("AuditLog_userId_idx", "userId"),
        Index("AuditLog_createdAt_idx", "createdAt"),
        Index("AuditLog_action_idx", "action"),
    )


class DestructionRecord(Base):
    __tablename__ = "DestructionRecord"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unitId = Column(Integer, ForeignKey("SerializedUnit.id"), nullable=False)
    destroyedById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    reason = Column(Text, nullable=False)
    destroyedAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    unit = relationship("SerializedUnit")
    destroyedBy = relationship("User")

    __table_args__ = (Index("DestructionRecord_unitId_idx", "unitId"),)


class Notification(Base):
    __tablename__ = "Notification"

    id = Column(Integer, primary_key=True, autoincrement=True)
    userId = Column(Integer, ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    isRead = Column(Boolean, nullable=False, default=False)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User")

    __table_args__ = (Index("Notification_userId_idx", "userId"),)


# ── Casino Card Inventory ──────────────────────────────────────────────────────

class CardColor(str, enum.Enum):
    BLACK = "BLACK"
    RED = "RED"


class CardMaterial(str, enum.Enum):
    PLASTIC = "PLASTIC"
    PAPER = "PAPER"


class DeckNumber(str, enum.Enum):
    DECK1 = "DECK1"
    DECK2 = "DECK2"
    DECK3 = "DECK3"
    DECK4 = "DECK4"
    DECK5 = "DECK5"
    DECK6 = "DECK6"
    DECK7 = "DECK7"
    DECK8 = "DECK8"


class BoxType(str, enum.Enum):
    STANDARD = "STANDARD"  # Contains all 8 deck groups (Deck1–Deck8)
    SPARE = "SPARE"        # Contains only one deck type


class ContainerEventType(str, enum.Enum):
    CREATED = "CREATED"
    LOCKED = "LOCKED"
    UNLOCKED = "UNLOCKED"
    DECK_CONSUMED = "DECK_CONSUMED"
    ARCHIVED = "ARCHIVED"
    QUANTITY_ADJUSTED = "QUANTITY_ADJUSTED"


class ShoeStatus(str, enum.Enum):
    IN_WAREHOUSE = "IN_WAREHOUSE"
    SENT_TO_STUDIO = "SENT_TO_STUDIO"
    RETURNED = "RETURNED"
    # Cards destroyed, physical shoe container remains in warehouse
    CARDS_DESTROYED = "CARDS_DESTROYED"
    # Shoe container recovered after card destruction — no cards, no deck increase
    EMPTY_SHOE_IN_WAREHOUSE = "EMPTY_SHOE_IN_WAREHOUSE"
    # Shoe reported as physically damaged — awaiting confirmation before final destroy
    PHYSICALLY_DAMAGED = "PHYSICALLY_DAMAGED"
    # Physical shoe container confirmed destroyed — shoe is fully removed from service
    PHYSICALLY_DESTROYED = "PHYSICALLY_DESTROYED"
    # Empty shoe container refilled with new decks — ready for studio deployment
    REFILLED = "REFILLED"
    # Legacy value kept for DB enum-type compat; treated as CARDS_DESTROYED in all logic
    DESTROYED = "DESTROYED"


class Studio(Base):
    __tablename__ = "Studio"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updatedAt = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    shoes = relationship("Shoe", back_populates="studio")


class DeckEntry(Base):
    """Records each batch of decks added to inventory."""

    __tablename__ = "DeckEntry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    color = Column(SAEnum(CardColor, name="CardColor", create_type=False), nullable=False)
    material = Column(
        SAEnum(CardMaterial, name="CardMaterial", create_type=False),
        nullable=True,
    )
    deckCount = Column(Integer, nullable=False)
    cardCount = Column(Integer, nullable=False)  # deckCount * 52
    note = Column(Text, nullable=True)
    createdById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    createdBy = relationship("User")

    __table_args__ = (Index("DeckEntry_color_idx", "color"),)


class Container(Base):
    """A physical deck container holding up to CONTAINER_CAPACITY decks.

    Containers are the sole storage mechanism for unshod decks.
    Shoe creation consumes from the oldest non-empty container first (FIFO).
    Partial containers (fewer than max capacity) are fully supported.
    """

    __tablename__ = "Container"

    CAPACITY = 192  # 24 boxes × 8 decks = 192

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False)  # e.g. CONTAINER-R01
    color = Column(SAEnum(CardColor, name="CardColor", create_type=False), nullable=False)
    material = Column(
        SAEnum(CardMaterial, name="CardMaterial", create_type=False),
        nullable=False,
    )
    decksRemaining = Column(Integer, nullable=False, default=CAPACITY)
    isLocked = Column(Boolean, nullable=False, default=False)
    createdById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    lockedAt = Column(DateTime, nullable=True)
    unlockedAt = Column(DateTime, nullable=True)
    archivedAt = Column(DateTime, nullable=True)  # set when fully depleted

    createdBy = relationship("User", foreign_keys=[createdById])
    events = relationship("ContainerEvent", back_populates="container", order_by="ContainerEvent.createdAt")
    shoes = relationship("Shoe", back_populates="container")

    @property
    def boxesRemaining(self) -> int:
        """Computed: number of whole boxes remaining in this container (1 box = 8 decks)."""
        return self.decksRemaining // 8 if self.decksRemaining else 0

    __table_args__ = (
        Index("Container_color_idx", "color"),
        Index("Container_archivedAt_idx", "archivedAt"),
    )


class Box(Base):
    """A box packaging unit containing exactly 8 decks.

    Standard boxes contain one deck from each of Deck1–Deck8.
    Spare boxes contain 8 decks of a single deck number.
    Boxes are the unit transferred into containers.
    1 container = 24 standard boxes = 192 decks (max capacity).
    """

    __tablename__ = "Box"

    DECKS_PER_BOX = 8

    id = Column(Integer, primary_key=True, autoincrement=True)
    color = Column(SAEnum(CardColor, name="CardColor", create_type=False), nullable=False)
    material = Column(SAEnum(CardMaterial, name="CardMaterial", create_type=False), nullable=False)
    boxType = Column(
        SAEnum(BoxType, name="BoxType", create_type=False),
        nullable=False,
        default=BoxType.STANDARD,
    )
    # Only set for SPARE boxes — which single deck group this box holds
    spareDeckNumber = Column(
        SAEnum(DeckNumber, name="DeckNumber", create_type=False),
        nullable=True,
    )
    # For standard boxes: which container holds this box (null for spare boxes)
    containerId = Column(Integer, ForeignKey("Container.id", ondelete="SET NULL"), nullable=True)
    # Set when consumed for a shoe
    isConsumed = Column(Boolean, nullable=False, default=False)
    consumedAt = Column(DateTime, nullable=True)
    consumedByShoeId = Column(Integer, ForeignKey("Shoe.id", ondelete="SET NULL"), nullable=True)

    createdById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    container = relationship("Container", foreign_keys=[containerId], backref="boxes")
    consumedByShoe = relationship("Shoe", foreign_keys=[consumedByShoeId])
    createdBy = relationship("User", foreign_keys=[createdById])

    __table_args__ = (
        Index("Box_color_idx", "color"),
        Index("Box_containerId_idx", "containerId"),
        Index("Box_isConsumed_idx", "isConsumed"),
    )


class ShredEvent(Base):
    """Records each card-shredding event with full traceability.

    Created every time POST /shoes/{id}/shred is triggered.
    Provides dedicated shredded-deck counters independent of shoe status.
    """

    __tablename__ = "ShredEvent"

    DECKS_PER_SHRED = 8
    CARDS_PER_SHRED = 416  # 8 decks × 52 cards

    id = Column(Integer, primary_key=True, autoincrement=True)
    shoeId = Column(Integer, ForeignKey("Shoe.id", ondelete="SET NULL"), nullable=True)
    color = Column(SAEnum(CardColor, name="CardColor", create_type=False), nullable=False)
    material = Column(SAEnum(CardMaterial, name="CardMaterial", create_type=False), nullable=True)
    decksShredded = Column(Integer, nullable=False, default=DECKS_PER_SHRED)
    cardsShredded = Column(Integer, nullable=False, default=CARDS_PER_SHRED)
    shredById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    note = Column(Text, nullable=True)
    shredAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    shoe = relationship("Shoe", foreign_keys=[shoeId])
    shredBy = relationship("User", foreign_keys=[shredById])

    __table_args__ = (
        Index("ShredEvent_color_idx", "color"),
        Index("ShredEvent_shredAt_idx", "shredAt"),
        Index("ShredEvent_shoeId_idx", "shoeId"),
    )


class ContainerEvent(Base):
    """Audit trail for every significant event on a Container."""

    __tablename__ = "ContainerEvent"

    id = Column(Integer, primary_key=True, autoincrement=True)
    containerId = Column(Integer, ForeignKey("Container.id", ondelete="CASCADE"), nullable=False)
    eventType = Column(
        SAEnum(ContainerEventType, name="ContainerEventType", create_type=False),
        nullable=False,
    )
    decksConsumed = Column(Integer, nullable=True)  # set for DECK_CONSUMED events
    shoeId = Column(Integer, ForeignKey("Shoe.id", ondelete="SET NULL"), nullable=True)
    userId = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    note = Column(Text, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    container = relationship("Container", back_populates="events")
    shoe = relationship("Shoe", foreign_keys=[shoeId])
    user = relationship("User", foreign_keys=[userId])


class Shoe(Base):
    """A shoe assembled from 8 decks of the same color.

    shoeNumber is a human-readable display identifier that can be reused after
    a shoe is destroyed (via the Replace Shoe workflow).  It is separate from
    the internal primary key ``id`` which is globally unique forever.
    """

    __tablename__ = "Shoe"

    id = Column(Integer, primary_key=True, autoincrement=True)
    shoeNumber = Column(String, nullable=False, default="0")
    color = Column(SAEnum(CardColor, name="CardColor", create_type=False), nullable=False)
    material = Column(SAEnum(CardMaterial, name="CardMaterial", create_type=False), nullable=True)
    status = Column(
        SAEnum(ShoeStatus, name="ShoeStatus", create_type=False),
        nullable=False,
        default=ShoeStatus.IN_WAREHOUSE,
    )
    studioId = Column(Integer, ForeignKey("Studio.id", ondelete="SET NULL"), nullable=True)
    createdById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    sentById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    returnedById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    destroyedById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)
    sentAt = Column(DateTime, nullable=True)
    returnedAt = Column(DateTime, nullable=True)
    destroyedAt = Column(DateTime, nullable=True)
    destroyReason = Column(Text, nullable=True)

    # Shoe recovery from CARDS_DESTROYED → EMPTY_SHOE_IN_WAREHOUSE (one-time only)
    recoveredAt = Column(DateTime, nullable=True)
    recoveredById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)

    # Physical damage report (RETURNED / EMPTY_SHOE_IN_WAREHOUSE → PHYSICALLY_DAMAGED)
    physicalDamageReason = Column(Text, nullable=True)
    physicalDamageAt = Column(DateTime, nullable=True)
    physicalDamageById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)

    # Physical destruction confirmation (PHYSICALLY_DAMAGED → PHYSICALLY_DESTROYED)
    physicallyDestroyedAt = Column(DateTime, nullable=True)
    physicallyDestroyedById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)

    # Shoe refill (EMPTY_SHOE_IN_WAREHOUSE → REFILLED)
    refilledAt = Column(DateTime, nullable=True)
    refilledById = Column(Integer, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)

    # Container from which this shoe's decks were sourced (FIFO consumption)
    containerId = Column(Integer, ForeignKey("Container.id", ondelete="SET NULL"), nullable=True)
    # Box from which this shoe's decks were sourced
    boxId = Column(Integer, ForeignKey("Box.id", ondelete="SET NULL"), nullable=True)

    studio = relationship("Studio", back_populates="shoes")
    createdBy = relationship("User", foreign_keys=[createdById])
    sentBy = relationship("User", foreign_keys=[sentById])
    returnedBy = relationship("User", foreign_keys=[returnedById])
    destroyedBy = relationship("User", foreign_keys=[destroyedById])
    recoveredBy = relationship("User", foreign_keys=[recoveredById])
    physicalDamageBy = relationship("User", foreign_keys=[physicalDamageById])
    physicallyDestroyedBy = relationship("User", foreign_keys=[physicallyDestroyedById])
    refilledBy = relationship("User", foreign_keys=[refilledById])
    container = relationship("Container", back_populates="shoes", foreign_keys=[containerId])
    box = relationship("Box", foreign_keys=[boxId])
