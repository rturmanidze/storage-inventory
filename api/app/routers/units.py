from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import SerializedUnit, User
from app.schemas import UnitCreate, UnitOut

router = APIRouter(prefix="/units", tags=["units"])


@router.get("", response_model=List[UnitOut])
def list_units(
    serial: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.models import Item

    q = db.query(SerializedUnit)
    if serial:
        q = q.filter(SerializedUnit.serial.ilike(f"%{serial}%"))
    if sku:
        q = q.join(Item).filter(Item.sku.ilike(f"%{sku}%"))
    return q.all()


@router.get("/{unit_id}", response_model=UnitOut)
def get_unit(
    unit_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    unit = db.query(SerializedUnit).filter(SerializedUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unit {unit_id} not found")
    return unit


@router.post("", response_model=UnitOut, status_code=status.HTTP_201_CREATED)
def create_unit(
    body: UnitCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    unit = SerializedUnit(**body.model_dump())
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit
