"""Box management: list boxes, create spare boxes, view box details.

Endpoints
---------
GET  /boxes              — List boxes with optional filters
GET  /boxes/spare        — List spare boxes
POST /boxes/spare        — Create a spare box
GET  /boxes/{id}         — Get box detail
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import Box, BoxType, CardColor, CardMaterial, DeckNumber, Role, User
from app.schemas import BoxOut, SpareBoxCreate

router = APIRouter(prefix="/boxes", tags=["boxes"])


@router.get("", response_model=List[BoxOut])
def list_boxes(
    color: Optional[CardColor] = Query(None),
    material: Optional[CardMaterial] = Query(None),
    box_type: Optional[BoxType] = Query(None, alias="boxType"),
    container_id: Optional[int] = Query(None, alias="containerId"),
    is_consumed: Optional[bool] = Query(None, alias="isConsumed"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List boxes with optional filters."""
    q = db.query(Box)
    if color is not None:
        q = q.filter(Box.color == color)
    if material is not None:
        q = q.filter(Box.material == material)
    if box_type is not None:
        q = q.filter(Box.boxType == box_type)
    if container_id is not None:
        q = q.filter(Box.containerId == container_id)
    if is_consumed is not None:
        q = q.filter(Box.isConsumed == is_consumed)
    return q.order_by(Box.createdAt.asc()).all()


@router.get("/spare", response_model=List[BoxOut])
def list_spare_boxes(
    color: Optional[CardColor] = Query(None),
    material: Optional[CardMaterial] = Query(None),
    deck_number: Optional[DeckNumber] = Query(None, alias="deckNumber"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List spare boxes."""
    q = db.query(Box).filter(Box.boxType == BoxType.SPARE)
    if color is not None:
        q = q.filter(Box.color == color)
    if material is not None:
        q = q.filter(Box.material == material)
    if deck_number is not None:
        q = q.filter(Box.spareDeckNumber == deck_number)
    return q.order_by(Box.createdAt.asc()).all()


@router.post("/spare", response_model=BoxOut, status_code=status.HTTP_201_CREATED)
def create_spare_box(
    body: SpareBoxCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONS_MANAGER)),
):
    """Create a spare box containing 8 decks of a single deck number.

    Spare boxes are stored separately and cannot be used for shoe creation.
    They are for traceability of partial deck sets.
    """
    now = datetime.utcnow()
    box = Box(
        color=body.color,
        material=body.material,
        boxType=BoxType.SPARE,
        spareDeckNumber=body.spareDeckNumber,
        containerId=None,  # Spare boxes are not in containers
        isConsumed=False,
        createdById=current_user.id,
        createdAt=now,
    )
    db.add(box)
    db.flush()

    log_action(
        db,
        "CREATE_SPARE_BOX",
        user_id=current_user.id,
        resource_type="box",
        resource_id=box.id,
        detail={
            "color": body.color.value,
            "material": body.material.value,
            "spareDeckNumber": body.spareDeckNumber.value,
            "note": body.note,
        },
        request=request,
    )
    db.commit()
    db.refresh(box)
    return box


@router.get("/{box_id}", response_model=BoxOut)
def get_box(
    box_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get box detail."""
    box = db.query(Box).filter(Box.id == box_id).first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
    return box
