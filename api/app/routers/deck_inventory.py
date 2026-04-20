"""
/deck-inventory  — canonical endpoints for the Deck Inventory module.

These mirror the /cards/* endpoints and serve as the primary API surface
defined in the refactoring spec.  The underlying data and business logic
live in cards.py and are shared between both route prefixes.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import CardColor, Role, User
from app.routers.cards import (
    _build_inventory_summary,
    _build_low_stock_response,
    add_decks,
    list_deck_entries,
)
from app.schemas import (
    AddDecksRequest,
    AddDecksResponse,
    CardInventorySummary,
    DeckEntryOut,
    DeckLowStockResponse,
)

router = APIRouter(prefix="/deck-inventory", tags=["deck-inventory"])


@router.post("", response_model=AddDecksResponse, status_code=status.HTTP_201_CREATED)
def create_deck_entry(
    body: AddDecksRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Add decks to inventory (same as POST /cards/decks). Auto-creates containers."""
    return add_decks(body, request, db, current_user)


@router.get("", response_model=List[DeckEntryOut])
def list_deck_inventory(
    color: Optional[CardColor] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all deck inventory entries, optionally filtered by color."""
    return list_deck_entries(color, db, current_user)


@router.get("/summary", response_model=CardInventorySummary)
def get_deck_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return aggregated deck & shoe inventory totals."""
    return _build_inventory_summary(db)


@router.get("/low-stock", response_model=DeckLowStockResponse)
def get_deck_low_stock(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return low-stock status for each card color against the configured threshold."""
    return _build_low_stock_response(db)
