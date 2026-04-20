from datetime import datetime
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
    DeckEntryOut,
    SendShoeRequest,
    ShoeOut,
)

router = APIRouter(prefix="/cards", tags=["cards"])

# Industry-standard casino card values — do not change without business sign-off
DECKS_PER_SHOE = 8    # 1 shoe holds exactly 8 decks
CARDS_PER_DECK = 52   # 1 standard deck = 52 cards (no jokers)


def _get_available_decks(db: Session, color: CardColor) -> int:
    """Return current available deck count for a given color."""
    total_added = (
        db.query(func.coalesce(func.sum(DeckEntry.deckCount), 0))
        .filter(DeckEntry.color == color)
        .scalar()
        or 0
    )
    shoes_created = (
        db.query(func.count(Shoe.id))
        .filter(Shoe.color == color)
        .scalar()
        or 0
    )
    return int(total_added) - (int(shoes_created) * DECKS_PER_SHOE)


def _build_inventory_summary(db: Session) -> CardInventorySummary:
    black_decks = _get_available_decks(db, CardColor.BLACK)
    red_decks = _get_available_decks(db, CardColor.RED)
    shoes_in_warehouse = (
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.IN_WAREHOUSE).scalar() or 0
    )
    shoes_sent = (
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.SENT_TO_STUDIO).scalar() or 0
    )
    total_shoes = int(shoes_in_warehouse) + int(shoes_sent)
    return CardInventorySummary(
        blackDecks=black_decks,
        redDecks=red_decks,
        blackCards=black_decks * CARDS_PER_DECK,
        redCards=red_decks * CARDS_PER_DECK,
        totalDecks=black_decks + red_decks,
        totalCards=(black_decks + red_decks) * CARDS_PER_DECK,
        shoesInWarehouse=int(shoes_in_warehouse),
        shoesSentToStudio=int(shoes_sent),
        totalShoes=total_shoes,
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


# ── Inventory Summary ─────────────────────────────────────────────────────────

@router.get("/inventory", response_model=CardInventorySummary)
def get_inventory_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _build_inventory_summary(db)


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
    shoe = Shoe(
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
        detail={"color": body.color.value, "decksConsumed": DECKS_PER_SHOE},
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
