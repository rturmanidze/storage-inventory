from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import CardColor, CardMaterial, Container, DeckEntry, Role, Shoe, ShoeStatus, Studio, User
from app.schemas import (
    AddDecksRequest,
    AddDecksResponse,
    CardInventorySummary,
    ConfirmPhysicalDestroyRequest,
    CreateShoeRequest,
    DeckColorStatus,
    DeckEntryOut,
    DeckLowStockResponse,
    DestroyShoeRequest,
    RecoverShoeRequest,
    RefillShoeRequest,
    ReplaceShoeRequest,
    ReportPhysicalDamageRequest,
    ReturnShoeRequest,
    SendShoeRequest,
    ShoeOut,
    StockForecastColor,
    StockForecastResponse,
)

router = APIRouter(prefix="/cards", tags=["cards"])

# Industry-standard casino card values — do not change without business sign-off
DECKS_PER_SHOE = 8    # 1 shoe holds exactly 8 decks
CARDS_PER_DECK = 52   # 1 standard deck = 52 cards (no jokers)

# Critical threshold for predictive stock alerts
CRITICAL_DECK_THRESHOLD = 200  # total decks across both colors

# Legacy per-color threshold (kept for backward-compatible /low-stock endpoint)
LOW_STOCK_THRESHOLD = 16  # 2 shoes worth of decks per color

# Number of days used to calculate the average daily consumption rate
FORECAST_LOOKBACK_DAYS = 30


def _get_available_decks(db: Session, color: CardColor) -> int:
    """Return current available deck count for a given color.

    Available decks = sum of decksRemaining across all unlocked, non-archived
    containers of the matching color.

    Locked containers are intentionally excluded — they cannot be consumed
    until manually unlocked by an admin.  This ensures that destroying cards,
    returning shoes, or any other lifecycle event never inflates the count:
    only consuming from a container (shoe creation / refill) reduces it.
    """
    return int(
        db.query(func.coalesce(func.sum(Container.decksRemaining), 0))
        .filter(
            Container.color == color,
            Container.archivedAt.is_(None),
            Container.isLocked.is_(False),
        )
        .scalar()
        or 0
    )

def _get_deck_count_by_material(db: Session, material: CardMaterial) -> int:
    """Return available deck count for a given material across all colors."""
    return int(
        db.query(func.coalesce(func.sum(Container.decksRemaining), 0))
        .filter(
            Container.material == material,
            Container.archivedAt.is_(None),
            Container.isLocked.is_(False),
        )
        .scalar()
        or 0
    )


def _build_inventory_summary(db: Session) -> CardInventorySummary:
    black_decks = _get_available_decks(db, CardColor.BLACK)
    red_decks = _get_available_decks(db, CardColor.RED)
    plastic_decks = _get_deck_count_by_material(db, CardMaterial.PLASTIC)
    paper_decks = _get_deck_count_by_material(db, CardMaterial.PAPER)

    # Per (color × material) deck counts from DeckEntry
    def _deck_cm(color: CardColor, material: CardMaterial) -> int:
        total = int(
            db.query(func.coalesce(func.sum(DeckEntry.deckCount), 0))
            .filter(DeckEntry.color == color, DeckEntry.material == material)
            .scalar() or 0
        )
        h = int(
            db.query(func.count(Shoe.id))
            .filter(
                Shoe.color == color, Shoe.material == material,
                Shoe.status.in_([
                    ShoeStatus.IN_WAREHOUSE,
                    ShoeStatus.SENT_TO_STUDIO,
                    ShoeStatus.RETURNED,
                    ShoeStatus.REFILLED,
                ]),
            )
            .scalar() or 0
        )
        d = int(
            db.query(func.count(Shoe.id))
            .filter(Shoe.color == color, Shoe.material == material, Shoe.destroyedAt.isnot(None))
            .scalar() or 0
        )
        # Extra correction for refilled shoes destroyed in a second (or later) cycle.
        extra_r = int(
            db.query(func.count(Shoe.id))
            .filter(
                Shoe.color == color, Shoe.material == material,
                Shoe.refilledAt.isnot(None),
                Shoe.destroyedAt.isnot(None),
                ~Shoe.status.in_([
                    ShoeStatus.IN_WAREHOUSE,
                    ShoeStatus.SENT_TO_STUDIO,
                    ShoeStatus.RETURNED,
                    ShoeStatus.REFILLED,
                ]),
            )
            .scalar() or 0
        )
        return total - (h + d + extra_r) * DECKS_PER_SHOE

    shoes_in_warehouse = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.IN_WAREHOUSE).scalar() or 0
    )
    shoes_sent = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.SENT_TO_STUDIO).scalar() or 0
    )
    shoes_returned = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.RETURNED).scalar() or 0
    )
    shoes_cards_destroyed = int(
        db.query(func.count(Shoe.id))
        .filter(Shoe.status.in_([ShoeStatus.CARDS_DESTROYED, ShoeStatus.DESTROYED]))
        .scalar()
        or 0
    )
    shoes_empty = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE).scalar() or 0
    )
    shoes_refilled = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.REFILLED).scalar() or 0
    )
    shoes_physically_damaged = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.PHYSICALLY_DAMAGED).scalar() or 0
    )
    shoes_physically_destroyed = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.PHYSICALLY_DESTROYED).scalar() or 0
    )
    total_shoes = int(db.query(func.count(Shoe.id)).scalar() or 0)
    plastic_shoes = int(
        db.query(func.count(Shoe.id)).filter(Shoe.material == CardMaterial.PLASTIC).scalar() or 0
    )
    paper_shoes = int(
        db.query(func.count(Shoe.id)).filter(Shoe.material == CardMaterial.PAPER).scalar() or 0
    )
    return CardInventorySummary(
        blackDecks=black_decks,
        redDecks=red_decks,
        blackCards=black_decks * CARDS_PER_DECK,
        redCards=red_decks * CARDS_PER_DECK,
        totalDecks=black_decks + red_decks,
        totalCards=(black_decks + red_decks) * CARDS_PER_DECK,
        plasticDecks=plastic_decks,
        paperDecks=paper_decks,
        plasticBlackDecks=_deck_cm(CardColor.BLACK, CardMaterial.PLASTIC),
        plasticRedDecks=_deck_cm(CardColor.RED, CardMaterial.PLASTIC),
        paperBlackDecks=_deck_cm(CardColor.BLACK, CardMaterial.PAPER),
        paperRedDecks=_deck_cm(CardColor.RED, CardMaterial.PAPER),
        shoesInWarehouse=shoes_in_warehouse,
        shoesSentToStudio=shoes_sent,
        shoesReturned=shoes_returned,
        shoesCardsDestroyed=shoes_cards_destroyed,
        shoesEmpty=shoes_empty,
        shoesRefilled=shoes_refilled,
        shoesPhysicallyDamaged=shoes_physically_damaged,
        shoesPhysicallyDestroyed=shoes_physically_destroyed,
        shoesDestroyed=shoes_cards_destroyed + shoes_physically_destroyed,
        totalShoes=total_shoes,
        plasticShoes=plastic_shoes,
        paperShoes=paper_shoes,
    )


def _build_forecast_color(
    db: Session,
    color: CardColor,
    current_decks: int,
    lookback_days: int,
    critical_threshold: int,
) -> StockForecastColor:
    """Calculate predictive stock forecast for a single deck color."""
    since = datetime.utcnow() - timedelta(days=lookback_days)

    # Shoes created (consumed decks) in the lookback window
    shoes_created = (
        db.query(func.count(Shoe.id))
        .filter(Shoe.color == color, Shoe.createdAt >= since)
        .scalar()
        or 0
    )
    # Shoes returned (restored decks) in the lookback window
    shoes_returned = (
        db.query(func.count(Shoe.id))
        .filter(Shoe.color == color, Shoe.returnedAt >= since)
        .scalar()
        or 0
    )

    net_decks_consumed = (int(shoes_created) - int(shoes_returned)) * DECKS_PER_SHOE
    avg_daily_usage = net_decks_consumed / lookback_days if lookback_days > 0 else 0.0

    is_critical = current_decks < critical_threshold
    estimated_days: Optional[float] = None
    estimated_date: Optional[datetime] = None

    if avg_daily_usage > 0 and current_decks > critical_threshold:
        estimated_days = (current_decks - critical_threshold) / avg_daily_usage
        estimated_date = datetime.utcnow() + timedelta(days=estimated_days)
    elif avg_daily_usage <= 0:
        # No net consumption — stock is stable or growing
        estimated_days = None
        estimated_date = None

    return StockForecastColor(
        color=color,
        currentDecks=current_decks,
        avgDailyUsage=round(avg_daily_usage, 2),
        estimatedDaysToThreshold=round(estimated_days, 1) if estimated_days is not None else None,
        estimatedDate=estimated_date,
        isCritical=is_critical,
    )


def _build_forecast(db: Session) -> StockForecastResponse:
    black_decks = _get_available_decks(db, CardColor.BLACK)
    red_decks = _get_available_decks(db, CardColor.RED)
    black_forecast = _build_forecast_color(db, CardColor.BLACK, black_decks, FORECAST_LOOKBACK_DAYS, CRITICAL_DECK_THRESHOLD)
    red_forecast = _build_forecast_color(db, CardColor.RED, red_decks, FORECAST_LOOKBACK_DAYS, CRITICAL_DECK_THRESHOLD)
    return StockForecastResponse(
        criticalThreshold=CRITICAL_DECK_THRESHOLD,
        lookbackDays=FORECAST_LOOKBACK_DAYS,
        black=black_forecast,
        red=red_forecast,
    )


# ── Deck Entries ──────────────────────────────────────────────────────────────

CONTAINER_CAPACITY = 200  # mirrors containers.py — decks per full container


def _auto_create_containers(
    db: Session,
    color: CardColor,
    material: CardMaterial,
    deck_count: int,
    note: Optional[str],
    user_id: int,
    request: Request,
) -> tuple:
    """Split *deck_count* into containers of CONTAINER_CAPACITY and persist them.

    Creates a single DeckEntry for the full *deck_count* (so Deck Receiving
    History shows one row per user action, not one row per container split).
    Then creates as many Container records as needed (max CONTAINER_CAPACITY
    decks each).

    Returns a ``(entries, containers_created)`` tuple where *entries* is the
    list containing the single DeckEntry and *containers_created* is the actual
    number of Container rows flushed.
    """
    from app.models import ContainerEvent, ContainerEventType  # local import to avoid circular

    now = datetime.utcnow()

    # ONE DeckEntry for the full amount — this is what shows in history
    entry = DeckEntry(
        color=color,
        material=material,
        deckCount=deck_count,
        cardCount=deck_count * CARDS_PER_DECK,
        note=note,
        createdById=user_id,
        createdAt=now,
    )
    db.add(entry)
    db.flush()

    log_action(
        db,
        "ADD_DECKS",
        user_id=user_id,
        resource_type="deck_entry",
        resource_id=entry.id,
        detail={
            "color": color.value,
            "material": material.value,
            "deckCount": deck_count,
            "cardCount": deck_count * CARDS_PER_DECK,
            "note": note,
        },
        request=request,
    )

    # Split into containers (max CONTAINER_CAPACITY each)
    remaining = deck_count
    containers_created = 0
    while remaining > 0:
        batch = min(remaining, CONTAINER_CAPACITY)
        remaining -= batch
        containers_created += 1

        ts = now.strftime("%Y%m%d%H%M%S")
        code = f"AUTO-{color.value[:1]}-{material.value[:2]}-{ts}-{containers_created:03d}"

        container = Container(
            code=code,
            color=color,
            material=material,
            decksRemaining=batch,
            isLocked=False,
            createdById=user_id,
            createdAt=now,
        )
        db.add(container)
        db.flush()

        db.add(ContainerEvent(
            containerId=container.id,
            eventType=ContainerEventType.CREATED,
            userId=user_id,
            note=f"Auto-created from deck addition — {batch} decks",
            createdAt=now,
        ))

        log_action(
            db,
            "CREATE_CONTAINER",
            user_id=user_id,
            resource_type="container",
            resource_id=container.id,
            detail={
                "code": code,
                "color": color.value,
                "material": material.value,
                "deckCount": batch,
                "autoCreated": True,
                "deckEntryId": entry.id,
            },
            request=request,
        )

    return [entry], containers_created


@router.post("/decks", response_model=AddDecksResponse, status_code=status.HTTP_201_CREATED)
def add_decks(
    body: AddDecksRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Add decks to inventory and automatically split them into containers (max 200 per container)."""
    entries, containers_created = _auto_create_containers(
        db,
        color=body.color,
        material=body.material,
        deck_count=body.deckCount,
        note=body.note,
        user_id=current_user.id,
        request=request,
    )
    db.commit()
    for e in entries:
        db.refresh(e)
    return AddDecksResponse(
        entries=entries,
        containersCreated=containers_created,
        totalDecks=body.deckCount,
        color=body.color,
        material=body.material,
    )


@router.get("/decks", response_model=List[DeckEntryOut])
def list_deck_entries(
    color: Optional[CardColor] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(DeckEntry)
    if color:
        q = q.filter(DeckEntry.color == color)
    return q.order_by(DeckEntry.createdAt.desc()).all()


def _build_low_stock_response(db: Session) -> DeckLowStockResponse:
    black_available = _get_available_decks(db, CardColor.BLACK)
    red_available = _get_available_decks(db, CardColor.RED)
    black_status = DeckColorStatus(
        available=black_available,
        threshold=LOW_STOCK_THRESHOLD,
        isLow=black_available < LOW_STOCK_THRESHOLD,
        cards=black_available * CARDS_PER_DECK,
    )
    red_status = DeckColorStatus(
        available=red_available,
        threshold=LOW_STOCK_THRESHOLD,
        isLow=red_available < LOW_STOCK_THRESHOLD,
        cards=red_available * CARDS_PER_DECK,
    )
    alert_count = sum([black_status.isLow, red_status.isLow])
    return DeckLowStockResponse(
        black=black_status,
        red=red_status,
        hasAlerts=alert_count > 0,
        alertCount=alert_count,
    )


# ── Inventory Summary ─────────────────────────────────────────────────────────

@router.get("/inventory", response_model=CardInventorySummary)
def get_inventory_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _build_inventory_summary(db)


@router.get("/low-stock", response_model=DeckLowStockResponse)
def get_low_stock(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _build_low_stock_response(db)


# ── Shoes ─────────────────────────────────────────────────────────────────────

def _get_available_decks_by_material(db: Session, color: CardColor, material: CardMaterial) -> int:
    """Available decks for a specific color+material combination."""
    total_added = int(
        db.query(func.coalesce(func.sum(DeckEntry.deckCount), 0))
        .filter(DeckEntry.color == color, DeckEntry.material == material)
        .scalar()
        or 0
    )
    holding_shoes = int(
        db.query(func.count(Shoe.id))
        .filter(
            Shoe.color == color,
            Shoe.material == material,
            Shoe.status.in_([
                ShoeStatus.IN_WAREHOUSE,
                ShoeStatus.SENT_TO_STUDIO,
                ShoeStatus.RETURNED,
                ShoeStatus.REFILLED,
            ]),
        )
        .scalar()
        or 0
    )
    cards_destroyed_shoes = int(
        db.query(func.count(Shoe.id))
        .filter(Shoe.color == color, Shoe.material == material, Shoe.destroyedAt.isnot(None))
        .scalar()
        or 0
    )
    # Extra correction for refilled shoes destroyed in a second (or later) cycle.
    extra_refill_destructions = int(
        db.query(func.count(Shoe.id))
        .filter(
            Shoe.color == color,
            Shoe.material == material,
            Shoe.refilledAt.isnot(None),
            Shoe.destroyedAt.isnot(None),
            ~Shoe.status.in_([
                ShoeStatus.IN_WAREHOUSE,
                ShoeStatus.SENT_TO_STUDIO,
                ShoeStatus.RETURNED,
                ShoeStatus.REFILLED,
            ]),
        )
        .scalar()
        or 0
    )
    return total_added - (holding_shoes + cards_destroyed_shoes + extra_refill_destructions) * DECKS_PER_SHOE


@router.post("/shoes", response_model=ShoeOut, status_code=status.HTTP_201_CREATED)
def create_shoe(
    body: CreateShoeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    # Check availability for the specific color+material combination
    available = _get_available_decks_by_material(db, body.color, body.material)
    if available < DECKS_PER_SHOE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Not enough {body.color.value} {body.material.value} decks. "
                f"Available: {available}, required: {DECKS_PER_SHOE}"
            ),
        )
    shoe = Shoe(
        shoeNumber=body.shoeNumber,
        color=body.color,
        material=body.material,
        status=ShoeStatus.IN_WAREHOUSE,
        createdById=current_user.id,
        createdAt=datetime.utcnow(),
    )
    db.add(shoe)
    db.flush()

    # FIFO container consumption filtered by color AND material
    from app.routers.containers import consume_decks_fifo  # noqa: PLC0415
    container = consume_decks_fifo(
        db, body.color, DECKS_PER_SHOE,
        material=body.material,
        user_id=current_user.id,
        shoe_id=shoe.id,
        request=request,
    )
    if container is not None:
        shoe.containerId = container.id

    log_action(
        db,
        "CREATE_SHOE",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe.id,
        detail={
            "color": body.color.value,
            "material": body.material.value,
            "decksConsumed": DECKS_PER_SHOE,
            "shoeNumber": shoe.shoeNumber,
            "containerId": container.id if container else None,
            "containerCode": container.code if container else None,
        },
        request=request,
    )
    db.commit()
    db.refresh(shoe)
    return shoe


@router.get("/shoes", response_model=List[ShoeOut])
def list_shoes(
    status: Optional[ShoeStatus] = Query(None),
    color: Optional[CardColor] = Query(None),
    studioId: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Shoe)
    if status:
        q = q.filter(Shoe.status == status)
    if color:
        q = q.filter(Shoe.color == color)
    if studioId:
        q = q.filter(Shoe.studioId == studioId)
    return q.order_by(Shoe.createdAt.desc()).all()


@router.get("/shoes/{shoe_id}", response_model=ShoeOut)
def get_shoe(
    shoe_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    return shoe


@router.post("/shoes/{shoe_id}/send-to-studio", response_model=ShoeOut)
def send_shoe_to_studio(
    shoe_id: int,
    body: SendShoeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if shoe.status == ShoeStatus.SENT_TO_STUDIO:
        raise HTTPException(status_code=400, detail="Shoe has already been sent to a studio")
    if shoe.status in (
        ShoeStatus.CARDS_DESTROYED,
        ShoeStatus.DESTROYED,
        ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE,
        ShoeStatus.PHYSICALLY_DAMAGED,
        ShoeStatus.PHYSICALLY_DESTROYED,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot send a shoe in status '{shoe.status.value}' to a studio",
        )
    if shoe.status not in (ShoeStatus.IN_WAREHOUSE, ShoeStatus.RETURNED, ShoeStatus.REFILLED):
        raise HTTPException(status_code=400, detail="Shoe is not in a sendable state")

    studio = db.query(Studio).filter(Studio.id == body.studioId).first()
    if not studio:
        raise HTTPException(status_code=404, detail="Studio not found")

    shoe.status = ShoeStatus.SENT_TO_STUDIO
    shoe.studioId = body.studioId
    shoe.sentById = current_user.id
    shoe.sentAt = datetime.utcnow()

    log_action(
        db,
        "SEND_SHOE_TO_STUDIO",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe_id,
        detail={"studioId": body.studioId, "studioName": studio.name, "color": shoe.color.value},
        request=request,
    )
    db.commit()
    db.refresh(shoe)
    return shoe


@router.post("/shoes/{shoe_id}/return-from-studio", response_model=ShoeOut)
def return_shoe_from_studio(
    shoe_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Return a shoe from a studio back to the warehouse deck pool.

    Restores DECKS_PER_SHOE decks to the available inventory.
    Only shoes with status SENT_TO_STUDIO can be returned.
    """
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if shoe.status in (
        ShoeStatus.CARDS_DESTROYED,
        ShoeStatus.DESTROYED,
        ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE,
        ShoeStatus.PHYSICALLY_DAMAGED,
        ShoeStatus.PHYSICALLY_DESTROYED,
    ):
        raise HTTPException(status_code=400, detail="Cannot return a shoe in its current state")
    if shoe.status == ShoeStatus.RETURNED:
        raise HTTPException(status_code=400, detail="Shoe has already been returned")
    if shoe.status != ShoeStatus.SENT_TO_STUDIO:
        raise HTTPException(
            status_code=400,
            detail="Only shoes currently in a studio (SENT_TO_STUDIO) can be returned",
        )

    shoe.status = ShoeStatus.RETURNED
    shoe.returnedById = current_user.id
    shoe.returnedAt = datetime.utcnow()

    log_action(
        db,
        "RETURN_SHOE_FROM_STUDIO",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe_id,
        detail={
            "studioId": shoe.studioId,
            "color": shoe.color.value,
            "decksRestored": 0,
            "note": "Shoe returned; decks remain held by shoe (not restored to free pool)",
        },
        request=request,
    )
    db.commit()
    db.refresh(shoe)
    return shoe


@router.post("/shoes/{shoe_id}/destroy", response_model=ShoeOut)
def destroy_cards(
    shoe_id: int,
    body: DestroyShoeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Destroy the cards inside a shoe (NOT the physical shoe container).

    The shoe container remains in the warehouse.  Only the cards are permanently
    removed from inventory.  Deck pool is reduced by DECKS_PER_SHOE permanently.

    Valid starting states: IN_WAREHOUSE, RETURNED.
    Resulting status: CARDS_DESTROYED.

    The shoe can later be recovered as an empty container via the
    POST /shoes/{id}/recover-shoe endpoint (one-time only).
    """
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if shoe.status in (
        ShoeStatus.CARDS_DESTROYED,
        ShoeStatus.DESTROYED,
        ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE,
    ):
        raise HTTPException(status_code=400, detail="Cards have already been destroyed for this shoe")
    if shoe.status == ShoeStatus.SENT_TO_STUDIO:
        raise HTTPException(
            status_code=400,
            detail="Cannot destroy cards while shoe is in a studio. Return it first.",
        )
    if shoe.status in (ShoeStatus.PHYSICALLY_DAMAGED, ShoeStatus.PHYSICALLY_DESTROYED):
        raise HTTPException(
            status_code=400,
            detail="Cannot destroy cards on a physically damaged or destroyed shoe",
        )
    if shoe.status not in (ShoeStatus.IN_WAREHOUSE, ShoeStatus.RETURNED, ShoeStatus.REFILLED):
        raise HTTPException(status_code=400, detail="Shoe is not in a valid state for card destruction")

    shoe.status = ShoeStatus.CARDS_DESTROYED
    shoe.destroyedById = current_user.id
    shoe.destroyedAt = datetime.utcnow()
    shoe.destroyReason = body.reason

    log_action(
        db,
        "DESTROY_CARDS",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe_id,
        detail={
            "color": shoe.color.value,
            "reason": body.reason,
            "decksDeducted": DECKS_PER_SHOE,
            "shoeRemains": True,
        },
        request=request,
    )
    db.commit()
    db.refresh(shoe)
    return shoe


@router.post("/shoes/{shoe_id}/replace", response_model=ShoeOut, status_code=status.HTTP_201_CREATED)
def replace_shoe(
    shoe_id: int,
    body: ReplaceShoeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Replace a physically-destroyed shoe with a new one sharing the same display number.

    Only shoes with status PHYSICALLY_DESTROYED can be replaced.
    Creates a brand-new Shoe entity with the same ``shoeNumber`` as the
    destroyed shoe.  Consumes DECKS_PER_SHOE decks from inventory exactly like
    a normal shoe creation.  Optionally sends the new shoe directly to a studio
    if ``studioId`` is provided in the request body.

    For shoes in CARDS_DESTROYED state use the recover-shoe endpoint instead.
    """
    original = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if original.status != ShoeStatus.PHYSICALLY_DESTROYED:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only physically destroyed shoes can be replaced with a new shoe. "
                "Current status: " + original.status.value + ". "
                "For shoes with destroyed cards use the recover-shoe endpoint."
            ),
        )

    available = _get_available_decks(db, original.color)
    if available < DECKS_PER_SHOE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not enough {original.color.value} decks. Available: {available}, required: {DECKS_PER_SHOE}",
        )

    new_shoe = Shoe(
        shoeNumber=original.shoeNumber,
        color=original.color,
        status=ShoeStatus.IN_WAREHOUSE,
        createdById=current_user.id,
        createdAt=datetime.utcnow(),
    )

    # Optionally send directly to a studio
    if body.studioId is not None:
        studio = db.query(Studio).filter(Studio.id == body.studioId).first()
        if not studio:
            raise HTTPException(status_code=404, detail="Studio not found")
        new_shoe.status = ShoeStatus.SENT_TO_STUDIO
        new_shoe.studioId = body.studioId
        new_shoe.sentById = current_user.id
        new_shoe.sentAt = datetime.utcnow()

    db.add(new_shoe)
    db.flush()

    # FIFO container consumption
    from app.routers.containers import consume_decks_fifo  # noqa: PLC0415
    container = consume_decks_fifo(
        db, original.color, DECKS_PER_SHOE,
        user_id=current_user.id,
        shoe_id=new_shoe.id,
        request=request,
    )
    if container is not None:
        new_shoe.containerId = container.id

    log_action(
        db,
        "REPLACE_SHOE",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=new_shoe.id,
        detail={
            "originalShoeId": shoe_id,
            "shoeNumber": new_shoe.shoeNumber,
            "color": new_shoe.color.value,
            "decksConsumed": DECKS_PER_SHOE,
            "sentToStudio": body.studioId,
            "containerId": container.id if container else None,
        },
        request=request,
    )
    db.commit()
    db.refresh(new_shoe)
    return new_shoe


@router.post("/shoes/{shoe_id}/recover-shoe", response_model=ShoeOut)
def recover_shoe(
    shoe_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Recover the physical shoe container after its cards have been destroyed.

    Transitions CARDS_DESTROYED → EMPTY_SHOE_IN_WAREHOUSE.

    Rules:
    - Only allowed ONCE per destroyed-cards event (enforced by status transition).
    - Cards remain destroyed — NO deck inventory increase.
    - Only the physical shoe container is restored for future use.
    """
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if shoe.status == ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE:
        raise HTTPException(
            status_code=400,
            detail="Shoe has already been recovered — it is currently an empty shoe in the warehouse",
        )
    if shoe.status not in (ShoeStatus.CARDS_DESTROYED, ShoeStatus.DESTROYED):
        raise HTTPException(
            status_code=400,
            detail=(
                "Only shoes with status CARDS_DESTROYED can be recovered. "
                "Current status: " + shoe.status.value
            ),
        )

    shoe.status = ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE
    shoe.recoveredById = current_user.id
    shoe.recoveredAt = datetime.utcnow()

    log_action(
        db,
        "RECOVER_SHOE",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe_id,
        detail={
            "color": shoe.color.value,
            "shoeNumber": shoe.shoeNumber,
            "deckIncrease": 0,
            "note": "Shoe container recovered; cards remain destroyed",
        },
        request=request,
    )
    db.commit()
    db.refresh(shoe)
    return shoe


@router.post("/shoes/{shoe_id}/refill", response_model=ShoeOut)
def refill_shoe(
    shoe_id: int,
    body: RefillShoeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Refill an empty shoe container with new decks.

    Transitions EMPTY_SHOE_IN_WAREHOUSE → REFILLED.

    Rules:
    - Only allowed for shoes in EMPTY_SHOE_IN_WAREHOUSE status.
    - Always loads exactly DECKS_PER_SHOE (8) decks.
    - Card color can be specified and may differ from the original shoe color.
    - Requires at least DECKS_PER_SHOE available decks in inventory of the chosen color.
    - Optionally sends the shoe directly to a studio via ``studioId``.

    Deck accounting:
    - REFILLED shoes are counted in holding_shoes (new cards present) AND in
      cards_destroyed_shoes (original cards were permanently destroyed).
    - Net effect: reduces available deck count by DECKS_PER_SHOE ✓
    """
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if shoe.status != ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only empty shoes (EMPTY_SHOE_IN_WAREHOUSE) can be refilled. "
                "Current status: " + shoe.status.value + ". "
                "Recover the shoe container first if cards were just destroyed."
            ),
        )

    available = _get_available_decks(db, body.color)
    if available < DECKS_PER_SHOE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Not enough {body.color.value} decks to refill. "
                f"Available: {available}, required: {DECKS_PER_SHOE}"
            ),
        )

    shoe.color = body.color
    shoe.status = ShoeStatus.REFILLED
    shoe.refilledById = current_user.id
    shoe.refilledAt = datetime.utcnow()
    # Clear studio assignment from prior cycle
    shoe.studioId = None

    log_action(
        db,
        "REFILL_SHOE",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe_id,
        detail={
            "shoeNumber": shoe.shoeNumber,
            "color": body.color.value,
            "decksConsumed": DECKS_PER_SHOE,
            "cardsLoaded": DECKS_PER_SHOE * CARDS_PER_DECK,
        },
        request=request,
    )

    # Optionally send directly to a studio
    if body.studioId is not None:
        studio = db.query(Studio).filter(Studio.id == body.studioId).first()
        if not studio:
            raise HTTPException(status_code=404, detail="Studio not found")
        shoe.status = ShoeStatus.SENT_TO_STUDIO
        shoe.studioId = body.studioId
        shoe.sentById = current_user.id
        shoe.sentAt = datetime.utcnow()
        log_action(
            db,
            "SEND_SHOE_TO_STUDIO",
            user_id=current_user.id,
            resource_type="shoe",
            resource_id=shoe_id,
            detail={
                "studioId": body.studioId,
                "studioName": studio.name,
                "color": shoe.color.value,
                "sentAfterRefill": True,
            },
            request=request,
        )

    db.commit()
    db.refresh(shoe)
    return shoe


@router.post("/shoes/{shoe_id}/report-physical-damage", response_model=ShoeOut)
def report_physical_damage(
    shoe_id: int,
    body: ReportPhysicalDamageRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Report a shoe as physically damaged.

    Transitions RETURNED or EMPTY_SHOE_IN_WAREHOUSE → PHYSICALLY_DAMAGED.

    Physical damage is ONLY for shoes with verified structural/physical damage
    (broken, cracked, unusable container).  This is NOT for card depletion or
    routine usage — use the destroy-cards endpoint for that.

    Cards must already be accounted for before reporting physical damage:
    - RETURNED: shoe has used cards that are considered permanently consumed.
      ``destroyedAt`` is set here so the deck pool correctly keeps those 8
      decks deducted (same effect as card destruction).
    - EMPTY_SHOE_IN_WAREHOUSE: cards were already destroyed via the destroy
      endpoint; ``destroyedAt`` is already set.

    After reporting, an admin/manager must confirm physical destruction via
    POST /shoes/{id}/confirm-physical-destroy.
    """
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if shoe.status == ShoeStatus.PHYSICALLY_DAMAGED:
        raise HTTPException(status_code=400, detail="Physical damage has already been reported for this shoe")
    if shoe.status == ShoeStatus.PHYSICALLY_DESTROYED:
        raise HTTPException(status_code=400, detail="Shoe has already been physically destroyed")
    if shoe.status not in (ShoeStatus.RETURNED, ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE):
        raise HTTPException(
            status_code=400,
            detail=(
                "Physical damage can only be reported for shoes in RETURNED or "
                "EMPTY_SHOE_IN_WAREHOUSE status. "
                "Current status: " + shoe.status.value + ". "
                "Ensure cards are returned or destroyed before reporting physical damage."
            ),
        )

    now = datetime.utcnow()
    prior_status = shoe.status

    shoe.status = ShoeStatus.PHYSICALLY_DAMAGED
    shoe.physicalDamageReason = body.reason
    shoe.physicalDamageAt = now
    shoe.physicalDamageById = current_user.id

    # When coming from RETURNED state the shoe still holds its 8 used decks.
    # Set destroyedAt so the pool formula keeps those 8 decks permanently
    # deducted (same accounting as an explicit card-destruction event).
    if prior_status == ShoeStatus.RETURNED and shoe.destroyedAt is None:
        shoe.destroyedAt = now
        shoe.destroyedById = current_user.id

    log_action(
        db,
        "REPORT_PHYSICAL_DAMAGE",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe_id,
        detail={
            "color": shoe.color.value,
            "shoeNumber": shoe.shoeNumber,
            "reason": body.reason,
            "priorStatus": prior_status.value,
            "decksAccountedFor": prior_status == ShoeStatus.RETURNED,
        },
        request=request,
    )
    db.commit()
    db.refresh(shoe)
    return shoe


@router.post("/shoes/{shoe_id}/confirm-physical-destroy", response_model=ShoeOut)
def confirm_physical_destroy(
    shoe_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Confirm physical destruction of a damaged shoe (irreversible).

    Transitions PHYSICALLY_DAMAGED → PHYSICALLY_DESTROYED.

    ⚠ This action is IRREVERSIBLE and applies only to physically damaged shoes.
    The shoe is fully removed from service.  A replacement shoe can be created
    via POST /shoes/{id}/replace (consumes 8 decks from inventory).

    Deck pool impact: none (cards were already returned or destroyed when
    physical damage was reported).
    """
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if shoe.status == ShoeStatus.PHYSICALLY_DESTROYED:
        raise HTTPException(status_code=400, detail="Shoe has already been physically destroyed")
    if shoe.status != ShoeStatus.PHYSICALLY_DAMAGED:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only shoes in PHYSICALLY_DAMAGED status can be confirmed as destroyed. "
                "Current status: " + shoe.status.value + ". "
                "Use the report-physical-damage endpoint first."
            ),
        )

    shoe.status = ShoeStatus.PHYSICALLY_DESTROYED
    shoe.physicallyDestroyedAt = datetime.utcnow()
    shoe.physicallyDestroyedById = current_user.id

    log_action(
        db,
        "CONFIRM_PHYSICAL_DESTROY",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe_id,
        detail={
            "color": shoe.color.value,
            "shoeNumber": shoe.shoeNumber,
            "damageReason": shoe.physicalDamageReason,
            "warning": "Irreversible — shoe fully removed from service",
        },
        request=request,
    )
    db.commit()
    db.refresh(shoe)
    return shoe


# ── Stock Forecast ─────────────────────────────────────────────────────────────

@router.get("/forecast", response_model=StockForecastResponse)
def get_stock_forecast(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Predictive stock forecast based on historical consumption rate.

    Returns the estimated number of days until deck inventory falls below
    the critical threshold (CRITICAL_DECK_THRESHOLD) based on average
    daily usage over the past FORECAST_LOOKBACK_DAYS days.
    """
    return _build_forecast(db)
