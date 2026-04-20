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
    CreateShoeRequest,
    DeckColorStatus,
    DeckEntryOut,
    DeckLowStockResponse,
    DestroyShoeRequest,
    ReplaceShoeRequest,
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
                    - (active shoes * DECKS_PER_SHOE)

    'Active' means the shoe is currently holding decks (IN_WAREHOUSE or
    SENT_TO_STUDIO).  RETURNED shoes have given their decks back to the
    pool; DESTROYED shoes are permanently removed from circulation
    (their decks were already subtracted when the shoe was created, and
    returning a RETURNED shoe then destroying it re-subtracts those decks).

    Formula: available = total_added - (all_non_returned_non_destroyed +
             destroyed_from_warehouse_or_studio) * 8
    Simplified: available = total_added - (shoes NOT in RETURNED status) * 8
    Wait — DESTROYED shoes should also reduce the pool permanently.

    Correct accounting:
    - IN_WAREHOUSE: shoe holds 8 decks (pool -8)
    - SENT_TO_STUDIO: shoe holds 8 decks (pool -8)
    - RETURNED: shoe gave decks back (pool +8 relative to creation)
    - DESTROYED: pool depends on prior state:
        - was IN_WAREHOUSE/SENT_TO_STUDIO → decks gone (pool -8, same as creation, no change)
        - was RETURNED → decks were back in pool, now destroyed (pool -8)

    Net formula: available = total_added - (IN_WAREHOUSE + SENT_TO_STUDIO + DESTROYED) * 8
    RETURNED shoes do NOT consume from the deck pool.
    """
    total_added = (
        db.query(func.coalesce(func.sum(DeckEntry.deckCount), 0))
        .filter(DeckEntry.color == color)
        .scalar()
        or 0
    )
    # Shoes that consume deck pool: everything except RETURNED
    consuming_shoes = (
        db.query(func.count(Shoe.id))
        .filter(
            Shoe.color == color,
            Shoe.status != ShoeStatus.RETURNED,
        )
        .scalar()
        or 0
    )
    return int(total_added) - (int(consuming_shoes) * DECKS_PER_SHOE)


def _build_inventory_summary(db: Session) -> CardInventorySummary:
    black_decks = _get_available_decks(db, CardColor.BLACK)
    red_decks = _get_available_decks(db, CardColor.RED)
    shoes_in_warehouse = (
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.IN_WAREHOUSE).scalar() or 0
    )
    shoes_sent = (
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.SENT_TO_STUDIO).scalar() or 0
    )
    shoes_returned = (
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.RETURNED).scalar() or 0
    )
    shoes_destroyed = (
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.DESTROYED).scalar() or 0
    )
    total_shoes = int(shoes_in_warehouse) + int(shoes_sent) + int(shoes_returned) + int(shoes_destroyed)
    return CardInventorySummary(
        blackDecks=black_decks,
        redDecks=red_decks,
        blackCards=black_decks * CARDS_PER_DECK,
        redCards=red_decks * CARDS_PER_DECK,
        totalDecks=black_decks + red_decks,
        totalCards=(black_decks + red_decks) * CARDS_PER_DECK,
        shoesInWarehouse=int(shoes_in_warehouse),
        shoesSentToStudio=int(shoes_sent),
        shoesReturned=int(shoes_returned),
        shoesDestroyed=int(shoes_destroyed),
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
    if shoe.status == ShoeStatus.DESTROYED:
        raise HTTPException(status_code=400, detail="Cannot send a destroyed shoe to a studio")
    if shoe.status not in (ShoeStatus.IN_WAREHOUSE, ShoeStatus.RETURNED):
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
    if shoe.status == ShoeStatus.DESTROYED:
        raise HTTPException(status_code=400, detail="Cannot return a destroyed shoe")
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
def destroy_shoe(
    shoe_id: int,
    body: DestroyShoeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Permanently destroy a shoe (mark as DESTROYED).

    - Cannot destroy an already-destroyed shoe.
    - Cannot destroy a shoe that is currently in a studio (must be returned first).
    - Decks for a RETURNED shoe are permanently removed from the pool.
    - Decks for an IN_WAREHOUSE shoe are permanently removed (no change needed
      since they were consumed on creation and never returned).
    """
    shoe = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not shoe:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if shoe.status == ShoeStatus.DESTROYED:
        raise HTTPException(status_code=400, detail="Shoe has already been destroyed")
    if shoe.status == ShoeStatus.SENT_TO_STUDIO:
        raise HTTPException(
            status_code=400,
            detail="Cannot destroy a shoe that is currently in a studio. Return it first.",
        )

    shoe.status = ShoeStatus.DESTROYED
    shoe.destroyedById = current_user.id
    shoe.destroyedAt = datetime.utcnow()
    shoe.destroyReason = body.reason

    log_action(
        db,
        "DESTROY_SHOE",
        user_id=current_user.id,
        resource_type="shoe",
        resource_id=shoe_id,
        detail={"color": shoe.color.value, "reason": body.reason},
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
    """Replace a destroyed shoe with a new one sharing the same display number.

    Creates a brand-new Shoe entity with the same ``shoeNumber`` as the
    destroyed shoe.  Consumes DECKS_PER_SHOE decks from inventory exactly like
    a normal shoe creation.  Optionally sends the new shoe directly to a studio
    if ``studioId`` is provided in the request body.
    """
    original = db.query(Shoe).filter(Shoe.id == shoe_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Shoe not found")
    if original.status != ShoeStatus.DESTROYED:
        raise HTTPException(
            status_code=400,
            detail="Only destroyed shoes can be replaced.  Current status: " + original.status.value,
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
