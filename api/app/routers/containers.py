"""Container management: creation, FIFO consumption, locking and full traceability.

Endpoints
---------
POST   /containers              — Create a new container (Admin / Manager)
GET    /containers              — List containers with optional filters
GET    /containers/{id}         — Get container detail + full event history
POST   /containers/{id}/lock    — Manually lock a container (Admin only)
POST   /containers/{id}/unlock  — Manually unlock a container (Admin only)

Cutting Card Container Endpoints
---------------------------------
POST   /containers/cutting-card              — Create a cutting card container
GET    /containers/cutting-card              — List cutting card containers
GET    /containers/cutting-card/{id}         — Get cutting card container detail
POST   /containers/cutting-card/{id}/lock    — Lock a cutting card container
POST   /containers/cutting-card/{id}/unlock  — Unlock a cutting card container
PATCH  /containers/cutting-card/{id}/quantity — Adjust available card count
"""
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import (
    CardColor,
    CardMaterial,
    Container,
    ContainerEvent,
    ContainerEventType,
    CuttingCardContainer,
    CuttingCardEvent,
    CuttingCardEventType,
    DeckEntry,
    DeckNumber,
    Role,
    ShoeContainerLink,
    User,
)
from app.routers.cards import CARDS_PER_DECK
from app.schemas import (
    ContainerCreate,
    ContainerOut,
    ContainerQuantityAdjust,
    ContainerRenameRequest,
    CuttingCardContainerCreate,
    CuttingCardContainerOut,
    CuttingCardContainerQuantityAdjust,
)

router = APIRouter(prefix="/containers", tags=["containers"])

CONTAINER_CAPACITY = 192  # 24 boxes × 8 decks = 192
CUTTING_CARDS_PER_SHOE = 2  # every shoe assembly deducts 2 cutting cards


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_container_or_404(db: Session, container_id: int) -> Container:
    container = db.query(Container).filter(Container.id == container_id).first()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    return container


def _add_event(
    db: Session,
    container: Container,
    event_type: ContainerEventType,
    *,
    user_id: Optional[int] = None,
    shoe_id: Optional[int] = None,
    decks_consumed: Optional[int] = None,
    note: Optional[str] = None,
) -> ContainerEvent:
    event = ContainerEvent(
        containerId=container.id,
        eventType=event_type,
        decksConsumed=decks_consumed,
        shoeId=shoe_id,
        userId=user_id,
        note=note,
        createdAt=datetime.utcnow(),
    )
    db.add(event)
    return event


def _get_cc_container_or_404(db: Session, container_id: int) -> CuttingCardContainer:
    container = db.query(CuttingCardContainer).filter(CuttingCardContainer.id == container_id).first()
    if not container:
        raise HTTPException(status_code=404, detail="Cutting card container not found")
    return container


def _add_cc_event(
    db: Session,
    container: CuttingCardContainer,
    event_type: CuttingCardEventType,
    *,
    user_id: Optional[int] = None,
    shoe_id: Optional[int] = None,
    cards_changed: Optional[int] = None,
    note: Optional[str] = None,
) -> CuttingCardEvent:
    event = CuttingCardEvent(
        containerId=container.id,
        eventType=event_type,
        cardsChanged=cards_changed,
        shoeId=shoe_id,
        userId=user_id,
        note=note,
        createdAt=datetime.utcnow(),
    )
    db.add(event)
    return event


# ── Public helpers used by cards.py shoe-creation / refill ────────────────────

def validate_containers_for_consumption(
    db: Session,
    color: CardColor,
    decks_needed: int,
    *,
    material: Optional[CardMaterial] = None,
) -> None:
    """Check that unlocked containers can satisfy *decks_needed* for the given color/material.

    Raises HTTPException 400 with a user-actionable message when:
    - All non-empty containers are locked   → "All containers are locked…"
    - Some unlocked containers exist but total < *decks_needed* → "Not enough decks…"

    Does nothing when no containers exist at all (legacy / pre-container data).
    """
    # Total containers with remaining decks (locked + unlocked)
    q_any = db.query(func.count(Container.id)).filter(
        Container.color == color,
        Container.archivedAt.is_(None),
        Container.decksRemaining > 0,
    )
    if material is not None:
        q_any = q_any.filter(Container.material == material)
    any_with_decks = int(q_any.scalar() or 0)

    if any_with_decks == 0:
        return  # No containers — legacy mode, allow the legacy pool to handle it

    # Total decks available in *unlocked* containers
    q_unlocked = db.query(func.coalesce(func.sum(Container.decksRemaining), 0)).filter(
        Container.color == color,
        Container.archivedAt.is_(None),
        Container.isLocked.is_(False),
        Container.decksRemaining > 0,
    )
    if material is not None:
        q_unlocked = q_unlocked.filter(Container.material == material)
    total_unlocked = int(q_unlocked.scalar() or 0)

    if total_unlocked >= decks_needed:
        return  # Enough available — all good

    if total_unlocked == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All containers are locked. Please unlock a container to continue.",
        )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Not enough decks in unlocked containers. Please unlock another container.",
    )


def validate_all_deck_types_available(
    db: Session,
    color: CardColor,
    material: Optional[CardMaterial] = None,
) -> None:
    """Validate that every deck type (DECK1–DECK8) has at least one unlocked container
    with ≥1 deck remaining for the given color/material combination.

    Raises HTTPException 400 listing missing deck types when any are unavailable.
    Only applies when deckType containers exist; skips check in legacy mode.
    """
    # Check whether any deckType-assigned containers exist for this color+material
    q_typed = db.query(func.count(Container.id)).filter(
        Container.color == color,
        Container.deckType.isnot(None),
        Container.archivedAt.is_(None),
    )
    if material is not None:
        q_typed = q_typed.filter(Container.material == material)
    typed_count = int(q_typed.scalar() or 0)

    if typed_count == 0:
        return  # Legacy mode — no deckType containers, skip this check

    missing: List[DeckNumber] = []
    for deck_type in DeckNumber:
        q = db.query(func.count(Container.id)).filter(
            Container.color == color,
            Container.deckType == deck_type,
            Container.archivedAt.is_(None),
            Container.isLocked.is_(False),
            Container.decksRemaining > 0,
        )
        if material is not None:
            q = q.filter(Container.material == material)
        available = int(q.scalar() or 0)
        if available == 0:
            missing.append(deck_type)

    if missing:
        missing_names = ", ".join(m.value for m in missing)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"All 8 deck types (Deck1–Deck8) are required to create a shoe. "
                f"Missing unlocked containers for: {missing_names}"
            ),
        )


def consume_one_deck_per_type(
    db: Session,
    color: CardColor,
    material: Optional[CardMaterial] = None,
    *,
    user_id: Optional[int],
    shoe_id: Optional[int],
) -> Optional[Dict[DeckNumber, Container]]:
    """Consume 1 deck from one unlocked container for EACH of the 8 deck types.

    Returns a mapping {DeckNumber → Container} on success, or None when any
    deck type has no available container (race condition guard).

    Side-effects (all flushed but NOT committed):
    - Reduces ``container.decksRemaining`` by 1 for each selected container.
    - Archives each container (``archivedAt``) when it becomes fully empty.
    - Appends DECK_CONSUMED and ARCHIVED ContainerEvents as appropriate.
    - Creates one ShoeContainerLink row per deck type.
    """
    now = datetime.utcnow()
    result: Dict[DeckNumber, Container] = {}

    for deck_type in DeckNumber:
        q = db.query(Container).filter(
            Container.color == color,
            Container.deckType == deck_type,
            Container.archivedAt.is_(None),
            Container.isLocked.is_(False),
            Container.decksRemaining > 0,
        )
        if material is not None:
            q = q.filter(Container.material == material)
        container: Optional[Container] = (
            q.order_by(Container.createdAt.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if container is None:
            return None  # Race condition — let caller raise an error

        container.decksRemaining -= 1

        _add_event(
            db, container, ContainerEventType.DECK_CONSUMED,
            user_id=user_id,
            shoe_id=shoe_id,
            decks_consumed=1,
            note=f"1 deck consumed for shoe #{shoe_id} ({deck_type.value})",
        )

        if container.decksRemaining == 0:
            container.archivedAt = now
            _add_event(
                db, container, ContainerEventType.ARCHIVED,
                user_id=user_id,
                note="Container fully depleted — archived",
            )

        # Record the link
        link = ShoeContainerLink(
            shoeId=shoe_id,
            containerId=container.id,
            deckType=deck_type,
            decksConsumed=1,
            createdAt=now,
        )
        db.add(link)

        result[deck_type] = container
        db.flush()

    return result


def consume_decks_fifo(
    db: Session,
    color: CardColor,
    decks_needed: int,
    *,
    material: Optional[CardMaterial] = None,
    user_id: Optional[int],
    shoe_id: Optional[int],
    request: Optional[Request] = None,
) -> Optional[Container]:
    """Consume *decks_needed* decks from unlocked containers in FIFO order.

    Legacy path used when no deckType-assigned containers exist.

    Splits consumption across multiple containers when necessary (e.g. container A
    has 6 decks and 8 are needed — takes 6 from A then 2 from B).

    Only unlocked (``isLocked=False``), non-archived containers are used.

    Returns the first container that was consumed from, or ``None`` when there
    are not enough decks in unlocked containers to satisfy the request.
    """
    now = datetime.utcnow()

    # Pre-check: is there enough total capacity across all unlocked containers?
    q_total = db.query(func.coalesce(func.sum(Container.decksRemaining), 0)).filter(
        Container.color == color,
        Container.archivedAt.is_(None),
        Container.isLocked.is_(False),
        Container.decksRemaining > 0,
    )
    if material is not None:
        q_total = q_total.filter(Container.material == material)
    total_available = int(q_total.scalar() or 0)

    if total_available < decks_needed:
        return None

    # Consume in FIFO order across as many containers as needed
    remaining = decks_needed
    first_container: Optional[Container] = None

    while remaining > 0:
        q = db.query(Container).filter(
            Container.color == color,
            Container.archivedAt.is_(None),
            Container.isLocked.is_(False),
            Container.decksRemaining > 0,
        )
        if material is not None:
            q = q.filter(Container.material == material)
        container: Optional[Container] = (
            q.order_by(Container.createdAt.asc())
            .with_for_update(skip_locked=True)
            .first()
        )

        if container is None:
            # Race condition: another transaction consumed decks between pre-check and loop
            return None

        if first_container is None:
            first_container = container

        take = min(remaining, container.decksRemaining)
        remaining -= take
        container.decksRemaining -= take

        _add_event(
            db, container, ContainerEventType.DECK_CONSUMED,
            user_id=user_id,
            shoe_id=shoe_id,
            decks_consumed=take,
            note=f"Consumed {take} decks for shoe #{shoe_id} ({decks_needed - remaining}/{decks_needed} total)",
        )

        # Archive when fully depleted
        if container.decksRemaining == 0:
            container.archivedAt = now
            _add_event(db, container, ContainerEventType.ARCHIVED, user_id=user_id,
                       note="Container fully depleted — archived")

        db.flush()

    return first_container


def validate_cutting_cards_available(db: Session, cards_needed: int = CUTTING_CARDS_PER_SHOE) -> None:
    """Raise HTTP 400 when there are insufficient cutting cards available."""
    total_available = int(
        db.query(func.coalesce(func.sum(CuttingCardContainer.availableCards), 0))
        .filter(
            CuttingCardContainer.isLocked.is_(False),
            CuttingCardContainer.archivedAt.is_(None),
        )
        .scalar()
        or 0
    )
    if total_available < cards_needed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Not enough cutting cards available. "
                f"Required: {cards_needed}, Available: {total_available}"
            ),
        )


def consume_cutting_cards(
    db: Session,
    *,
    cards_needed: int = CUTTING_CARDS_PER_SHOE,
    user_id: Optional[int],
    shoe_id: Optional[int],
    event_type: CuttingCardEventType = CuttingCardEventType.DEDUCTED,
    note: Optional[str] = None,
) -> Optional[CuttingCardContainer]:
    """Deduct *cards_needed* cutting cards from the first available (unlocked) container.

    Returns the container used, or None when none is available (race guard).
    ``event_type`` defaults to DEDUCTED for new shoes; pass REPLACED for the
    replace-cutting-cards workflow.
    """
    container: Optional[CuttingCardContainer] = (
        db.query(CuttingCardContainer)
        .filter(
            CuttingCardContainer.isLocked.is_(False),
            CuttingCardContainer.archivedAt.is_(None),
            CuttingCardContainer.availableCards >= cards_needed,
        )
        .order_by(CuttingCardContainer.createdAt.asc())
        .with_for_update(skip_locked=True)
        .first()
    )
    if container is None:
        return None

    container.availableCards -= cards_needed
    if container.availableCards == 0:
        container.archivedAt = datetime.utcnow()
        _add_cc_event(db, container, CuttingCardEventType.QUANTITY_ADJUSTED,
                      user_id=user_id, note="Container fully depleted — archived")

    _add_cc_event(
        db, container, event_type,
        user_id=user_id,
        shoe_id=shoe_id,
        cards_changed=-cards_needed,
        note=note or f"Deducted {cards_needed} cutting cards for shoe #{shoe_id}",
    )
    db.flush()
    return container


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=ContainerOut, status_code=status.HTTP_201_CREATED)
def create_container(
    body: ContainerCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONS_MANAGER, Role.SHIFT_MANAGER)),
):
    """Create a new deck container.

    When ``deckType`` is provided the container participates in the
    8-container shoe assembly workflow (1 deck consumed per deck type per shoe).
    Legacy containers without a ``deckType`` fall back to FIFO bulk consumption.
    """
    # Ensure code is unique
    existing = db.query(Container).filter(Container.code == body.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Container code '{body.code}' already exists",
        )

    now = datetime.utcnow()
    container = Container(
        code=body.code,
        color=body.color,
        material=body.material,
        deckType=body.deckType,
        decksRemaining=CONTAINER_CAPACITY,
        isLocked=False,
        createdById=current_user.id,
        createdAt=now,
    )
    db.add(container)
    db.flush()

    # Also create a matching DeckEntry so the legacy deck pool stays accurate
    entry = DeckEntry(
        color=body.color,
        material=body.material,
        deckCount=CONTAINER_CAPACITY,
        cardCount=CONTAINER_CAPACITY * CARDS_PER_DECK,
        note=f"Auto-created for container {body.code}",
        createdById=current_user.id,
        createdAt=now,
    )
    db.add(entry)
    db.flush()

    _add_event(db, container, ContainerEventType.CREATED, user_id=current_user.id,
               note=f"Container created with {CONTAINER_CAPACITY} decks"
                    + (f" (deck type: {body.deckType.value})" if body.deckType else ""))

    log_action(
        db,
        "CREATE_CONTAINER",
        user_id=current_user.id,
        resource_type="container",
        resource_id=container.id,
        detail={
            "code": body.code,
            "color": body.color.value,
            "material": body.material.value,
            "deckType": body.deckType.value if body.deckType else None,
            "capacity": CONTAINER_CAPACITY,
        },
        request=request,
    )
    db.commit()
    db.refresh(container)
    return container


@router.get("", response_model=List[ContainerOut])
def list_containers(
    color: Optional[CardColor] = Query(None),
    material: Optional[CardMaterial] = Query(None),
    deckType: Optional[DeckNumber] = Query(None),
    archived: Optional[bool] = Query(None, description="true = archived only, false = active only"),
    locked: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List containers with optional filters."""
    q = db.query(Container)
    if color is not None:
        q = q.filter(Container.color == color)
    if material is not None:
        q = q.filter(Container.material == material)
    if deckType is not None:
        q = q.filter(Container.deckType == deckType)
    if archived is True:
        q = q.filter(Container.archivedAt.isnot(None))
    elif archived is False:
        q = q.filter(Container.archivedAt.is_(None))
    if locked is not None:
        q = q.filter(Container.isLocked == locked)
    return q.order_by(Container.createdAt.asc()).all()


@router.get("/{container_id}", response_model=ContainerOut)
def get_container(
    container_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get full container detail including event history."""
    return _get_container_or_404(db, container_id)


@router.post("/{container_id}/lock", response_model=ContainerOut)
def lock_container(
    container_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONS_MANAGER, Role.SHIFT_MANAGER)),
):
    """Manually lock a container (Admin only)."""
    container = _get_container_or_404(db, container_id)
    if container.archivedAt is not None:
        raise HTTPException(status_code=400, detail="Cannot lock an archived container")
    if container.isLocked:
        raise HTTPException(status_code=400, detail="Container is already locked")

    now = datetime.utcnow()
    container.isLocked = True
    container.lockedAt = now

    _add_event(db, container, ContainerEventType.LOCKED, user_id=current_user.id,
               note="Manually locked by admin")
    log_action(
        db, "LOCK_CONTAINER", user_id=current_user.id,
        resource_type="container", resource_id=container_id,
        detail={"code": container.code},
        request=request,
    )
    db.commit()
    db.refresh(container)
    return container


@router.post("/{container_id}/unlock", response_model=ContainerOut)
def unlock_container(
    container_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONS_MANAGER, Role.SHIFT_MANAGER)),
):
    """Manually unlock a container (Admin only).  Does not un-archive it."""
    container = _get_container_or_404(db, container_id)
    if not container.isLocked:
        raise HTTPException(status_code=400, detail="Container is already unlocked")

    now = datetime.utcnow()
    container.isLocked = False
    container.unlockedAt = now

    _add_event(db, container, ContainerEventType.UNLOCKED, user_id=current_user.id,
               note="Manually unlocked by admin")
    log_action(
        db, "UNLOCK_CONTAINER", user_id=current_user.id,
        resource_type="container", resource_id=container_id,
        detail={"code": container.code},
        request=request,
    )
    db.commit()
    db.refresh(container)
    return container


@router.patch("/{container_id}/rename", response_model=ContainerOut)
def rename_container(
    container_id: int,
    body: ContainerRenameRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Rename a container (Admin / Manager). Does not affect internal ID or event history."""
    container = _get_container_or_404(db, container_id)

    # Ensure new code is unique (skip self-comparison)
    existing = (
        db.query(Container)
        .filter(Container.code == body.code, Container.id != container_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Container code '{body.code}' is already in use",
        )

    old_code = container.code
    container.code = body.code

    log_action(
        db, "RENAME_CONTAINER", user_id=current_user.id,
        resource_type="container", resource_id=container_id,
        detail={"oldCode": old_code, "newCode": body.code},
        request=request,
    )
    db.commit()
    db.refresh(container)
    return container


@router.patch("/{container_id}/quantity", response_model=ContainerOut)
def adjust_container_quantity(
    container_id: int,
    body: ContainerQuantityAdjust,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    """Manually adjust the deck count of a container (Admin only).

    Used for physical recount corrections and inventory reconciliation.
    All changes are fully audit-logged with old value, new value, and optional reason.
    - Max decks per container: 192 (24 boxes × 8 decks)
    - Archived containers cannot be adjusted.
    """
    container = _get_container_or_404(db, container_id)

    if container.archivedAt is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot adjust quantity of an archived container",
        )

    if body.decks < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Deck count cannot be negative",
        )
    if body.decks > CONTAINER_CAPACITY:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Deck count cannot exceed container capacity of {CONTAINER_CAPACITY}",
        )

    old_decks = container.decksRemaining
    new_decks = body.decks

    if old_decks == new_decks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New quantity is the same as the current value — no change made",
        )

    container.decksRemaining = new_decks

    # If adjusted to zero, archive the container
    if new_decks == 0:
        container.archivedAt = datetime.utcnow()
        _add_event(db, container, ContainerEventType.ARCHIVED, user_id=current_user.id,
                   note="Container archived after manual quantity set to 0")

    note = f"Manual quantity adjustment: {old_decks} → {new_decks} decks"
    if body.reason:
        note += f" | Reason: {body.reason}"

    _add_event(
        db, container, ContainerEventType.QUANTITY_ADJUSTED,
        user_id=current_user.id,
        decks_consumed=old_decks - new_decks if old_decks > new_decks else None,
        note=note,
    )

    log_action(
        db, "ADJUST_CONTAINER_QUANTITY", user_id=current_user.id,
        resource_type="container", resource_id=container_id,
        detail={
            "code": container.code,
            "oldDecks": old_decks,
            "newDecks": new_decks,
            "delta": new_decks - old_decks,
            "reason": body.reason,
        },
        request=request,
    )
    db.commit()
    db.refresh(container)
    return container


# ── Cutting Card Container Endpoints ──────────────────────────────────────────

@router.post("/cutting-card", response_model=CuttingCardContainerOut, status_code=status.HTTP_201_CREATED)
def create_cutting_card_container(
    body: CuttingCardContainerCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Create a new cutting card container. Admin / Manager only."""
    existing = db.query(CuttingCardContainer).filter(CuttingCardContainer.code == body.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cutting card container code '{body.code}' already exists",
        )

    now = datetime.utcnow()
    container = CuttingCardContainer(
        code=body.code,
        totalCards=body.totalCards,
        availableCards=body.totalCards,
        isLocked=False,
        createdById=current_user.id,
        createdAt=now,
    )
    db.add(container)
    db.flush()

    _add_cc_event(
        db, container, CuttingCardEventType.CREATED,
        user_id=current_user.id,
        cards_changed=body.totalCards,
        note=f"Created with {body.totalCards} cutting cards",
    )
    log_action(
        db, "CREATE_CUTTING_CARD_CONTAINER", user_id=current_user.id,
        resource_type="cutting_card_container", resource_id=container.id,
        detail={"code": body.code, "totalCards": body.totalCards},
        request=request,
    )
    db.commit()
    db.refresh(container)
    return container


@router.get("/cutting-card", response_model=List[CuttingCardContainerOut])
def list_cutting_card_containers(
    archived: Optional[bool] = Query(None),
    locked: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List cutting card containers."""
    q = db.query(CuttingCardContainer)
    if archived is True:
        q = q.filter(CuttingCardContainer.archivedAt.isnot(None))
    elif archived is False:
        q = q.filter(CuttingCardContainer.archivedAt.is_(None))
    if locked is not None:
        q = q.filter(CuttingCardContainer.isLocked == locked)
    return q.order_by(CuttingCardContainer.createdAt.asc()).all()


@router.get("/cutting-card/{container_id}", response_model=CuttingCardContainerOut)
def get_cutting_card_container(
    container_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get full cutting card container detail."""
    return _get_cc_container_or_404(db, container_id)


@router.post("/cutting-card/{container_id}/lock", response_model=CuttingCardContainerOut)
def lock_cutting_card_container(
    container_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Lock a cutting card container."""
    container = _get_cc_container_or_404(db, container_id)
    if container.archivedAt is not None:
        raise HTTPException(status_code=400, detail="Cannot lock an archived container")
    if container.isLocked:
        raise HTTPException(status_code=400, detail="Container is already locked")

    container.isLocked = True
    container.lockedAt = datetime.utcnow()

    _add_cc_event(db, container, CuttingCardEventType.QUANTITY_ADJUSTED, user_id=current_user.id,
                  note="Manually locked")
    log_action(db, "LOCK_CUTTING_CARD_CONTAINER", user_id=current_user.id,
               resource_type="cutting_card_container", resource_id=container_id,
               detail={"code": container.code}, request=request)
    db.commit()
    db.refresh(container)
    return container


@router.post("/cutting-card/{container_id}/unlock", response_model=CuttingCardContainerOut)
def unlock_cutting_card_container(
    container_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Unlock a cutting card container."""
    container = _get_cc_container_or_404(db, container_id)
    if not container.isLocked:
        raise HTTPException(status_code=400, detail="Container is already unlocked")

    container.isLocked = False
    container.unlockedAt = datetime.utcnow()

    _add_cc_event(db, container, CuttingCardEventType.QUANTITY_ADJUSTED, user_id=current_user.id,
                  note="Manually unlocked")
    log_action(db, "UNLOCK_CUTTING_CARD_CONTAINER", user_id=current_user.id,
               resource_type="cutting_card_container", resource_id=container_id,
               detail={"code": container.code}, request=request)
    db.commit()
    db.refresh(container)
    return container


@router.patch("/cutting-card/{container_id}/quantity", response_model=CuttingCardContainerOut)
def adjust_cutting_card_quantity(
    container_id: int,
    body: CuttingCardContainerQuantityAdjust,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    """Manually adjust the available cutting card count (Admin only)."""
    container = _get_cc_container_or_404(db, container_id)

    if container.archivedAt is not None:
        raise HTTPException(status_code=400, detail="Cannot adjust an archived container")

    old_count = container.availableCards
    new_count = body.availableCards

    if old_count == new_count:
        raise HTTPException(status_code=400, detail="New count is the same as current — no change made")

    if new_count > container.totalCards:
        raise HTTPException(
            status_code=422,
            detail=f"Available cards cannot exceed total cards ({container.totalCards})",
        )

    container.availableCards = new_count

    if new_count == 0:
        container.archivedAt = datetime.utcnow()

    note = f"Manual adjustment: {old_count} → {new_count} cutting cards"
    if body.reason:
        note += f" | Reason: {body.reason}"

    _add_cc_event(
        db, container, CuttingCardEventType.QUANTITY_ADJUSTED,
        user_id=current_user.id,
        cards_changed=new_count - old_count,
        note=note,
    )
    log_action(
        db, "ADJUST_CUTTING_CARD_QUANTITY", user_id=current_user.id,
        resource_type="cutting_card_container", resource_id=container_id,
        detail={"code": container.code, "oldCount": old_count, "newCount": new_count, "reason": body.reason},
        request=request,
    )
    db.commit()
    db.refresh(container)
    return container
