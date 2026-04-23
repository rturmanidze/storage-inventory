from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field

from app.models import CardColor, CardMaterial, ContainerEventType, IssuedToType, MovementType, Role, ShoeStatus, UnitStatus


# ── Shared config ──────────────────────────────────────────────────────────────

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ───────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(OrmBase):
    id: int
    username: str
    email: str
    role: Role
    createdAt: datetime
    updatedAt: datetime


class TokenResponse(BaseModel):
    access_token: str
    user: UserOut


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: Role = Role.VIEWER


class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[Role] = None
    password: Optional[str] = None


class UserSelfPasswordUpdate(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


# ── Warehouse ──────────────────────────────────────────────────────────────────

class WarehouseCreate(BaseModel):
    code: str
    name: str
    address: Optional[str] = None


class WarehouseUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    address: Optional[str] = None


class LocationOut(OrmBase):
    id: int
    warehouseId: int
    code: str
    description: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


class WarehouseOut(OrmBase):
    id: int
    code: str
    name: str
    address: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
    locations: List[LocationOut] = []


# ── Location ───────────────────────────────────────────────────────────────────

class LocationCreate(BaseModel):
    code: str
    description: Optional[str] = None


class LocationUpdate(BaseModel):
    code: Optional[str] = None
    description: Optional[str] = None


class LocationWithWarehouseOut(OrmBase):
    id: int
    warehouseId: int
    code: str
    description: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
    warehouse: Optional[WarehouseOut] = None


# ── Item ───────────────────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    batch: Optional[str] = None
    unit: Optional[str] = "pcs"
    minStock: Optional[int] = 0


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    batch: Optional[str] = None
    unit: Optional[str] = None
    minStock: Optional[int] = None


class BarcodeOut(OrmBase):
    id: int
    itemId: int
    value: str
    createdAt: datetime


class BarcodeCreate(BaseModel):
    value: str


class ItemOut(OrmBase):
    id: int
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    batch: Optional[str] = None
    unit: str
    minStock: int
    createdAt: datetime
    updatedAt: datetime
    barcodes: List[BarcodeOut] = []


# ── Unit ───────────────────────────────────────────────────────────────────────

class UnitCreate(BaseModel):
    itemId: int
    serial: str
    currentLocationId: Optional[int] = None


class UnitOut(OrmBase):
    id: int
    itemId: int
    serial: str
    status: UnitStatus
    currentLocationId: Optional[int] = None
    createdAt: datetime
    updatedAt: datetime
    item: Optional[ItemOut] = None
    currentLocation: Optional[LocationWithWarehouseOut] = None


class UnitStatusUpdate(BaseModel):
    status: UnitStatus
    reason: Optional[str] = None


class DestroyUnitRequest(BaseModel):
    reason: str = Field(min_length=1)


class DestructionRecordOut(OrmBase):
    id: int
    unitId: int
    destroyedById: Optional[int] = None
    reason: str
    destroyedAt: datetime
    destroyedBy: Optional[UserOut] = None


class UnitWithDestructionOut(OrmBase):
    id: int
    itemId: int
    serial: str
    status: UnitStatus
    currentLocationId: Optional[int] = None
    createdAt: datetime
    updatedAt: datetime
    item: Optional[ItemOut] = None
    currentLocation: Optional[LocationWithWarehouseOut] = None
    destructionRecord: Optional[DestructionRecordOut] = None


# ── IssuedTo ───────────────────────────────────────────────────────────────────

class IssuedToCreate(BaseModel):
    name: str
    type: Optional[IssuedToType] = IssuedToType.PERSON


class IssuedToUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[IssuedToType] = None


class IssuedToOut(OrmBase):
    id: int
    name: str
    type: IssuedToType
    createdAt: datetime
    updatedAt: datetime


# ── Movements ─────────────────────────────────────────────────────────────────

class ReceiveLine(BaseModel):
    serial: str
    toLocationId: int


class ReceiveMovementRequest(BaseModel):
    note: Optional[str] = None
    itemId: int
    lines: List[ReceiveLine]


class TransferLine(BaseModel):
    serial: str
    toLocationId: int


class TransferMovementRequest(BaseModel):
    note: Optional[str] = None
    lines: List[TransferLine]


class IssueLine(BaseModel):
    serial: str


class IssueMovementRequest(BaseModel):
    note: Optional[str] = None
    issuedToId: int
    lines: List[IssueLine]


class ReturnLine(BaseModel):
    serial: str
    toLocationId: int


class ReturnMovementRequest(BaseModel):
    note: Optional[str] = None
    lines: List[ReturnLine]


class MovementLineOut(OrmBase):
    id: int
    movementId: int
    serialUnitId: int
    fromLocationId: Optional[int] = None
    toLocationId: Optional[int] = None
    issuedToId: Optional[int] = None
    serialUnit: Optional[UnitOut] = None
    fromLocation: Optional[LocationOut] = None
    toLocation: Optional[LocationOut] = None
    issuedTo: Optional[IssuedToOut] = None


class MovementCreatedByOut(OrmBase):
    id: int
    username: str
    email: str
    role: Role


class MovementOut(OrmBase):
    id: int
    type: MovementType
    note: Optional[str] = None
    createdAt: datetime
    createdById: int
    createdBy: Optional[MovementCreatedByOut] = None
    lines: List[MovementLineOut] = []


# ── Unit History ──────────────────────────────────────────────────────────────

class UnitHistoryEvent(BaseModel):
    eventType: str
    timestamp: datetime
    performedBy: Optional[str] = None
    detail: str
    movementId: Optional[int] = None
    fromLocation: Optional[str] = None
    toLocation: Optional[str] = None
    issuedTo: Optional[str] = None


# ── Dashboard ─────────────────────────────────────────────────────────────────

class LowStockItem(BaseModel):
    id: int
    sku: str
    name: str
    category: Optional[str] = None
    inStockCount: int
    minStock: int


class RecentMovement(BaseModel):
    id: int
    type: MovementType
    note: Optional[str] = None
    createdAt: datetime
    createdBy: MovementCreatedByOut
    linesCount: int


class DashboardStats(BaseModel):
    totalUnits: int
    statusBreakdown: dict
    lowStockItems: List[LowStockItem]
    recentMovements: List[RecentMovement]


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLogOut(OrmBase):
    id: int
    userId: Optional[int] = None
    action: str
    resourceType: Optional[str] = None
    resourceId: Optional[str] = None
    detail: Optional[str] = None
    ipAddress: Optional[str] = None
    createdAt: datetime
    user: Optional[UserOut] = None


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationOut(OrmBase):
    id: int
    userId: int
    type: str
    title: str
    message: str
    isRead: bool
    createdAt: datetime


# ── Import ────────────────────────────────────────────────────────────────────

# ── Scan ──────────────────────────────────────────────────────────────────────

class BarcodeScanResponse(BaseModel):
    items: List[ItemOut]
    found: bool


class ItemCreateWithBarcode(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    batch: Optional[str] = None
    unit: Optional[str] = "pcs"
    minStock: Optional[int] = 0
    barcode: str


# ── Import ────────────────────────────────────────────────────────────────────

class ImportError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    success: int
    errors: List[ImportError]


# ── Studios ───────────────────────────────────────────────────────────────────

class StudioCreate(BaseModel):
    name: str
    description: Optional[str] = None


class StudioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class StudioOut(OrmBase):
    id: int
    name: str
    description: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime


# ── Card Inventory ────────────────────────────────────────────────────────────

class AddDecksRequest(BaseModel):
    color: CardColor
    material: CardMaterial
    deckCount: int = Field(gt=0)
    note: Optional[str] = None


class DeckEntryOut(OrmBase):
    id: int
    color: CardColor
    material: Optional[CardMaterial] = None
    deckCount: int
    cardCount: int
    note: Optional[str] = None
    createdById: Optional[int] = None
    createdAt: datetime
    createdBy: Optional[MovementCreatedByOut] = None


class AddDecksResponse(BaseModel):
    """Response returned when decks are added — one entry per auto-created container."""
    entries: List[DeckEntryOut]
    containersCreated: int
    totalDecks: int
    color: CardColor
    material: CardMaterial


class ContainerRenameRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)


class CreateShoeRequest(BaseModel):
    color: CardColor
    material: CardMaterial
    shoeNumber: str = Field(min_length=1, max_length=32)


class SendShoeRequest(BaseModel):
    studioId: int


class ShoeOut(OrmBase):
    id: int
    shoeNumber: str
    color: CardColor
    material: Optional[CardMaterial] = None
    status: ShoeStatus
    studioId: Optional[int] = None
    containerId: Optional[int] = None
    createdById: Optional[int] = None
    sentById: Optional[int] = None
    returnedById: Optional[int] = None
    destroyedById: Optional[int] = None
    recoveredById: Optional[int] = None
    physicalDamageById: Optional[int] = None
    physicallyDestroyedById: Optional[int] = None
    createdAt: datetime
    sentAt: Optional[datetime] = None
    returnedAt: Optional[datetime] = None
    destroyedAt: Optional[datetime] = None
    destroyReason: Optional[str] = None
    recoveredAt: Optional[datetime] = None
    physicalDamageReason: Optional[str] = None
    physicalDamageAt: Optional[datetime] = None
    physicallyDestroyedAt: Optional[datetime] = None
    refilledAt: Optional[datetime] = None
    refilledById: Optional[int] = None
    studio: Optional[StudioOut] = None
    createdBy: Optional[MovementCreatedByOut] = None
    sentBy: Optional[MovementCreatedByOut] = None
    returnedBy: Optional[MovementCreatedByOut] = None
    destroyedBy: Optional[MovementCreatedByOut] = None
    recoveredBy: Optional[MovementCreatedByOut] = None
    physicalDamageBy: Optional[MovementCreatedByOut] = None
    physicallyDestroyedBy: Optional[MovementCreatedByOut] = None
    refilledBy: Optional[MovementCreatedByOut] = None


class CardInventorySummary(BaseModel):
    blackDecks: int
    redDecks: int
    blackCards: int
    redCards: int
    totalDecks: int
    totalCards: int
    # Material breakdown
    plasticDecks: int = 0
    paperDecks: int = 0
    plasticBlackDecks: int = 0
    plasticRedDecks: int = 0
    paperBlackDecks: int = 0
    paperRedDecks: int = 0
    shoesInWarehouse: int
    shoesSentToStudio: int
    shoesReturned: int
    shoesCardsDestroyed: int
    shoesEmpty: int
    shoesRefilled: int
    shoesPhysicallyDamaged: int
    shoesPhysicallyDestroyed: int
    # Legacy alias for backward compat — equals shoesCardsDestroyed + shoesPhysicallyDestroyed
    shoesDestroyed: int
    totalShoes: int
    # Shoes by material
    plasticShoes: int = 0
    paperShoes: int = 0
    # Shredded deck metrics (deck-loads permanently removed via card shredding)
    totalShreddedDecks: int = 0
    totalShreddedCards: int = 0
    shreddedBlackDecks: int = 0
    shreddedRedDecks: int = 0
    shreddedPlasticDecks: int = 0
    shreddedPaperDecks: int = 0
    # Total physical stock across ALL containers (locked + unlocked, non-archived)
    # These differ from blackDecks/redDecks/totalDecks when containers are locked.
    totalStockDecks: int = 0
    totalStockCards: int = 0
    lockedDecks: int = 0


class DeckColorStatus(BaseModel):
    available: int
    threshold: int
    isLow: bool
    cards: int


class DeckLowStockResponse(BaseModel):
    black: DeckColorStatus
    red: DeckColorStatus
    hasAlerts: bool
    alertCount: int


class ReturnShoeRequest(BaseModel):
    pass  # No additional fields required; user is derived from JWT


class DestroyShoeRequest(BaseModel):
    reason: str = Field(min_length=1)


# Alias kept for clarity — destroying cards (not shoe)
DestroyCardsRequest = DestroyShoeRequest


class RecoverShoeRequest(BaseModel):
    pass  # No extra fields; shoe is recovered by user action alone


class ReportPhysicalDamageRequest(BaseModel):
    reason: str = Field(min_length=1)


class ConfirmPhysicalDestroyRequest(BaseModel):
    pass  # Confirmation is implicit; user identity derived from JWT


class RefillShoeRequest(BaseModel):
    """Refill an empty shoe container with new cards (always 8 decks)."""
    color: CardColor
    material: CardMaterial
    studioId: Optional[int] = None  # If set, immediately sends the refilled shoe to this studio


class ReplaceShoeRequest(BaseModel):
    """Request to replace a destroyed shoe — creates a new shoe with the same display number."""
    studioId: Optional[int] = None  # If set, the new shoe is immediately sent to this studio


class StockForecastColor(BaseModel):
    color: CardColor
    currentDecks: int
    avgDailyUsage: float
    estimatedDaysToThreshold: Optional[float] = None
    estimatedDate: Optional[datetime] = None
    isCritical: bool


class StockForecastResponse(BaseModel):
    criticalThreshold: int
    lookbackDays: int
    black: StockForecastColor
    red: StockForecastColor


class DashboardCardStats(BaseModel):
    inventory: CardInventorySummary
    recentEntries: List[DeckEntryOut]
    lowStock: DeckLowStockResponse
    forecast: StockForecastResponse


# ── Card Reports ──────────────────────────────────────────────────────────────

class ShoeStatusCount(BaseModel):
    status: ShoeStatus
    count: int


class DeckConsumptionDay(BaseModel):
    day: str
    decksConsumed: int
    shoesCreated: int
    shoesReturned: int


class CardReportSummary(BaseModel):
    totalBlackDecks: int
    totalRedDecks: int
    totalDecks: int
    totalBlackCards: int
    totalRedCards: int
    totalCards: int
    # Material breakdown
    totalPlasticDecks: int = 0
    totalPaperDecks: int = 0
    totalPlasticCards: int = 0
    totalPaperCards: int = 0
    shoesCreated: int
    shoesInWarehouse: int
    shoesSentToStudio: int
    shoesReturned: int
    shoesCardsDestroyed: int
    shoesEmpty: int
    shoesRefilled: int
    shoesPhysicallyDamaged: int
    shoesPhysicallyDestroyed: int
    shoesDestroyed: int  # legacy alias
    totalShoes: int
    # Shoes by material
    plasticShoesCreated: int = 0
    paperShoesCreated: int = 0
    # Shredded deck metrics (deck-loads permanently removed via card shredding)
    totalShreddedDecks: int = 0
    totalShreddedCards: int = 0
    shreddedBlackDecks: int = 0
    shreddedRedDecks: int = 0
    shreddedBlackCards: int = 0
    shreddedRedCards: int = 0
    shreddedPlasticDecks: int = 0
    shreddedPaperDecks: int = 0
    shreddedPlasticCards: int = 0
    shreddedPaperCards: int = 0
    dailyShredding: List[DeckConsumptionDay] = []
    dailyConsumption: List[DeckConsumptionDay]
    # Total physical stock across ALL containers (locked + unlocked, non-archived)
    totalStockDecks: int = 0
    totalStockCards: int = 0
    lockedDecks: int = 0



# ── Containers ────────────────────────────────────────────────────────────────

class ContainerCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    color: CardColor
    material: CardMaterial


class ContainerUserOut(OrmBase):
    id: int
    username: str


class ContainerEventOut(OrmBase):
    id: int
    containerId: int
    eventType: ContainerEventType
    decksConsumed: Optional[int] = None
    shoeId: Optional[int] = None
    userId: Optional[int] = None
    note: Optional[str] = None
    createdAt: datetime
    user: Optional[ContainerUserOut] = None


class ContainerOut(OrmBase):
    id: int
    code: str
    color: CardColor
    material: CardMaterial
    decksRemaining: int
    isLocked: bool
    createdById: Optional[int] = None
    createdAt: datetime
    lockedAt: Optional[datetime] = None
    unlockedAt: Optional[datetime] = None
    archivedAt: Optional[datetime] = None
    createdBy: Optional[ContainerUserOut] = None
    events: List[ContainerEventOut] = []
