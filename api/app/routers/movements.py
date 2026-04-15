from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Movement, MovementLine, MovementType, SerializedUnit, UnitStatus, User
from app.schemas import (
    IssueMovementRequest,
    MovementOut,
    ReceiveMovementRequest,
    ReturnMovementRequest,
    TransferMovementRequest,
)

router = APIRouter(prefix="/movements", tags=["movements"])


@router.post("/receive", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
def receive(
    body: ReceiveMovementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lines = []
    for line in body.lines:
        unit = db.query(SerializedUnit).filter(SerializedUnit.serial == line.serial).first()
        if not unit:
            unit = SerializedUnit(
                serial=line.serial,
                itemId=body.itemId,
                status=UnitStatus.IN_STOCK,
                currentLocationId=line.toLocationId,
            )
            db.add(unit)
            db.flush()
        else:
            unit.status = UnitStatus.IN_STOCK
            unit.currentLocationId = line.toLocationId
            db.flush()
        lines.append(MovementLine(serialUnitId=unit.id, toLocationId=line.toLocationId))

    movement = Movement(
        type=MovementType.RECEIVE,
        note=body.note,
        createdById=current_user.id,
        lines=lines,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


@router.post("/transfer", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
def transfer(
    body: TransferMovementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lines = []
    for line in body.lines:
        unit = db.query(SerializedUnit).filter(SerializedUnit.serial == line.serial).first()
        if not unit:
            raise HTTPException(status_code=404, detail=f"Serial {line.serial} not found")
        if unit.status != UnitStatus.IN_STOCK:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unit {line.serial} cannot be transferred: status is {unit.status}",
            )
        from_location_id = unit.currentLocationId
        unit.currentLocationId = line.toLocationId
        db.flush()
        lines.append(
            MovementLine(
                serialUnitId=unit.id,
                fromLocationId=from_location_id,
                toLocationId=line.toLocationId,
            )
        )

    movement = Movement(
        type=MovementType.TRANSFER,
        note=body.note,
        createdById=current_user.id,
        lines=lines,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


@router.post("/issue", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
def issue(
    body: IssueMovementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lines = []
    for line in body.lines:
        unit = db.query(SerializedUnit).filter(SerializedUnit.serial == line.serial).first()
        if not unit:
            raise HTTPException(status_code=404, detail=f"Serial {line.serial} not found")
        from_location_id = unit.currentLocationId
        unit.status = UnitStatus.ISSUED
        unit.currentLocationId = None
        db.flush()
        lines.append(
            MovementLine(
                serialUnitId=unit.id,
                fromLocationId=from_location_id,
                issuedToId=body.issuedToId,
            )
        )

    movement = Movement(
        type=MovementType.ISSUE,
        note=body.note,
        createdById=current_user.id,
        lines=lines,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


@router.post("/return", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
def return_movement(
    body: ReturnMovementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lines = []
    for line in body.lines:
        unit = db.query(SerializedUnit).filter(SerializedUnit.serial == line.serial).first()
        if not unit:
            raise HTTPException(status_code=404, detail=f"Serial {line.serial} not found")
        unit.status = UnitStatus.IN_STOCK
        unit.currentLocationId = line.toLocationId
        db.flush()
        lines.append(MovementLine(serialUnitId=unit.id, toLocationId=line.toLocationId))

    movement = Movement(
        type=MovementType.RETURN,
        note=body.note,
        createdById=current_user.id,
        lines=lines,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


@router.get("", response_model=List[MovementOut])
def list_movements(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from datetime import datetime

    q = db.query(Movement)
    if from_date:
        q = q.filter(Movement.createdAt >= datetime.fromisoformat(from_date))
    if to_date:
        q = q.filter(Movement.createdAt <= datetime.fromisoformat(to_date))
    if type:
        q = q.filter(Movement.type == type)
    return q.order_by(Movement.createdAt.desc()).all()


@router.get("/{movement_id}", response_model=MovementOut)
def get_movement(
    movement_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    movement = db.query(Movement).filter(Movement.id == movement_id).first()
    if not movement:
        raise HTTPException(status_code=404, detail=f"Movement {movement_id} not found")
    return movement
