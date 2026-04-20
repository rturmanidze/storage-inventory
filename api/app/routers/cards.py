from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import CardColor, DeckEntry, Role, Shoe, ShoeStatus, Studio, User
from app.schemas import (
    AddDecksRequest,
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

    Available decks = total added via DeckEntry
                    - decks currently held by active shoes
                    - decks permanently destroyed (cards destroyed workflow)

    Deck accounting per status:
    - IN_WAREHOUSE:           shoe holds 8 decks  (pool -8)
    - SENT_TO_STUDIO:         shoe holds 8 decks  (pool -8)
    - RETURNED:               decks back in pool  (no impact)
    - CARDS_DESTROYED:        cards gone permanently (pool -8, tracked via destroyedAt)
    - EMPTY_SHOE_IN_WAREHOUSE: cards already destroyed (pool -8, destroyedAt set)
    - PHYSICALLY_DAMAGED:     depends on prior path:
        from RETURNED           → decks in pool (destroyedAt is NULL)
        from EMPTY_SHOE         → cards destroyed (destroyedAt is NOT NULL, pool -8)
    - PHYSICALLY_DESTROYED:   same logic as PHYSICALLY_DAMAGED
    - DESTROYED (legacy):     treated as CARDS_DESTROYED (destroyedAt IS NOT NULL)

    Formula:
        available = total_added
                  - (IN_WAREHOUSE + SENT_TO_STUDIO shoes) * 8
                  - (shoes where destroyedAt IS NOT NULL) * 8
    """
    total_added = (
        db.query(func.coalesce(func.sum(DeckEntry.deckCount), 0))
        .filter(DeckEntry.color == color)
        .scalar()
        or 0
    )
    # Shoes currently holding their 8 decks (including refilled shoes with new cards)
    holding_shoes = (
        db.query(func.count(Shoe.id))
        .filter(
            Shoe.color == color,
            Shoe.status.in_([ShoeStatus.IN_WAREHOUSE, ShoeStatus.SENT_TO_STUDIO, ShoeStatus.REFILLED]),
        )
        .scalar()
        or 0
    )
    # Shoes whose cards were permanently destroyed (set when destroy-cards action runs)
    cards_destroyed_shoes = (
        db.query(func.count(Shoe.id))
        .filter(
            Shoe.color == color,
            Shoe.destroyedAt.isnot(None),
        )
        .scalar()
        or 0
    )
    return int(total_added) - (int(holding_shoes) + int(cards_destroyed_shoes)) * DECKS_PER_SHOE


def _build_inventory_summary(db: Session) -> CardInventorySummary:
    black_decks = _get_available_decks(db, CardColor.BLACK)
    red_decks = _get_available_decks(db, CardColor.RED)
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
    return CardInventorySummary(
        blackDecks=black_decks,
        redDecks=red_decks,
        blackCards=black_decks * CARDS_PER_DECK,
        redCards=red_decks * CARDS_PER_DECK,
        totalDecks=black_decks + red_decks,
        totalCards=(black_decks + red_decks) * CARDS_PER_DECK,
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

@router.post("/decks", response_model=DeckEntryOut, status_code=status.HTTP_201_CREATED)
def add_decks(
    body: AddDecksRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    entry = DeckEntry(
        color=body.color,
        deckCount=body.deckCount,
        cardCount=body.deckCount * CARDS_PER_DECK,
        note=body.note,
        createdById=current_user.id,
        createdAt=datetime.utcnow(),
    )
    db.add(entry)
    db.flush()
    log_action(
        db,
        "ADD_DECKS",
        user_id=current_user.id,
        resource_type="deck_entry",
        resource_id=entry.id,
        detail={"color": body.color.value, "deckCount": body.deckCount, "cardCount": entry.cardCount},
        request=request,
    )
    db.commit()
    db.refresh(entry)
    return entry


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

@router.post("/shoes", response_model=ShoeOut, status_code=status.HTTP_201_CREATED)
def create_shoe(
    body: CreateShoeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    available = _get_available_decks(db, body.color)
    if available < DECKS_PER_SHOE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not enough {body.color.value} decks. Available: {available}, required: {DECKS_PER_SHOE}",
        )
    # Assign the next sequential shoe number (max across ALL shoes + 1)
    max_number = db.query(func.coalesce(func.max(Shoe.shoeNumber), 0)).scalar() or 0
    shoe = Shoe(
        shoeNumber=int(max_number) + 1,
        color=body.color,
        status=ShoeStatus.IN_WAREHOUSE,
        createdById=current_user.id,
        createdAt=datetime.utcnow(),
    )
    db.add(shoe)
    db.flush()
    log_action(
        db,
        "CREATE_SHOE",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe.id,
        detail={"color": body.color.value, "decksConsumed": DECKS_PER_SHOE, "shoeNumber": shoe.shoeNumber},
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
            "decksRestored": DECKS_PER_SHOE,
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

    Cards must be already accounted for before reporting physical damage:
    - RETURNED: cards were returned to the deck pool (via return-from-studio).
    - EMPTY_SHOE_IN_WAREHOUSE: cards were destroyed (via destroy endpoint).

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

    shoe.status = ShoeStatus.PHYSICALLY_DAMAGED
    shoe.physicalDamageReason = body.reason
    shoe.physicalDamageAt = datetime.utcnow()
    shoe.physicalDamageById = current_user.id

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
