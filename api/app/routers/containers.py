"""Container management: creation, FIFO consumption, locking and full traceability.

Endpoints
---------
POST   /containers              — Create a new container (Admin / Manager)
GET    /containers              — List containers with optional filters
GET    /containers/{id}         — Get container detail + full event history
POST   /containers/{id}/lock    — Manually lock a container (Admin only)
POST   /containers/{id}/unlock  — Manually unlock a container (Admin only)
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import CardColor, CardMaterial, Container, ContainerEvent, ContainerEventType, DeckEntry, Role, User
from app.routers.cards import CARDS_PER_DECK
from app.schemas import ContainerCreate, ContainerOut, ContainerRenameRequest

router = APIRouter(prefix="/containers", tags=["containers"])

CONTAINER_CAPACITY = 200  # Fixed deck capacity per container


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


# ── Public helper used by cards.py shoe-creation ──────────────────────────────

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

    Splits consumption across multiple containers when necessary (e.g. container A
    has 6 decks and 8 are needed — takes 6 from A then 2 from B).

    Only unlocked (``isLocked=False``), non-archived containers are used.
    Containers are NEVER automatically locked by this function; locking is
    exclusively a manual admin action.

    Returns the first container that was consumed from, or ``None`` when there
    are not enough decks in unlocked containers to satisfy the request.

    Side-effects (all flushed but NOT committed):
    - Reduces ``container.decksRemaining`` across one or more containers.
    - Archives each container (``archivedAt``) when it becomes fully empty.
    - Appends DECK_CONSUMED and ARCHIVED ContainerEvents as appropriate.
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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=ContainerOut, status_code=status.HTTP_201_CREATED)
def create_container(
    body: ContainerCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Create a new deck container (200 decks, fixed capacity)."""
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
               note=f"Container created with {CONTAINER_CAPACITY} decks")

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
    current_user: User = Depends(require_roles(Role.ADMIN)),
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
    current_user: User = Depends(require_roles(Role.ADMIN)),
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
