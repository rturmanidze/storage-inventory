from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user
from app.database import get_db
from app.models import Item, Movement, MovementLine, MovementType, SerializedUnit, UnitStatus, User
from app.schemas import (
    IssueMovementRequest,
    MovementOut,
    ReceiveMovementRequest,
    ReturnMovementRequest,
    TransferMovementRequest,
)
from app.websocket import manager as ws_manager

router = APIRouter(prefix="/movements", tags=["movements"])


async def _broadcast_movement(movement: Movement) -> None:
    await ws_manager.broadcast({
        "event": "movement_created",
        "movementId": movement.id,
        "type": movement.type.value,
        "createdAt": movement.createdAt.isoformat(),
        "unitCount": len(movement.lines),
    })


def _check_low_stock(db: Session, item_id: int) -> Optional[dict]:
    """Return low-stock alert data if the item is below minStock, else None."""
    item = db.query(Item).filter(Item.id == item_id).first()
    if item is None:
        return None
    in_stock = (
        db.query(SerializedUnit)
        .filter(SerializedUnit.itemId == item_id, SerializedUnit.status == UnitStatus.IN_STOCK)
        .count()
    )
    if in_stock < item.minStock:
        return {"itemId": item_id, "sku": item.sku, "name": item.name, "inStock": in_stock, "minStock": item.minStock}
    return None


@router.post("/receive", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
async def receive(
    body: ReceiveMovementRequest,
    request: Request,
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
    db.flush()
    log_action(
        db,
        "RECEIVE",
        user_id=current_user.id,
        resource_type="movement",
        resource_id=movement.id,
        detail={"itemId": body.itemId, "lineCount": len(lines), "note": body.note},
        request=request,
    )
    db.commit()
    db.refresh(movement)

    await _broadcast_movement(movement)
    low = _check_low_stock(db, body.itemId)
    if low:
        await ws_manager.broadcast({"event": "low_stock_alert", **low})

    return movement


@router.post("/transfer", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
async def transfer(
    body: TransferMovementRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lines = []
    item_ids: set[int] = set()
    for line in body.lines:
        unit = db.query(SerializedUnit).filter(SerializedUnit.serial == line.serial).first()
        if not unit:
            raise HTTPException(status_code=404, detail=f"Serial {line.serial} not found")
        if unit.status == UnitStatus.DESTROYED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unit {line.serial} is destroyed and cannot be transferred",
            )
        if unit.status != UnitStatus.IN_STOCK:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unit {line.serial} cannot be transferred: status is {unit.status}",
            )
        from_location_id = unit.currentLocationId
        unit.currentLocationId = line.toLocationId
        db.flush()
        item_ids.add(unit.itemId)
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
    db.flush()
    log_action(
        db,
        "TRANSFER",
        user_id=current_user.id,
        resource_type="movement",
        resource_id=movement.id,
        detail={"lineCount": len(lines), "note": body.note},
        request=request,
    )
    db.commit()
    db.refresh(movement)

    await _broadcast_movement(movement)
    return movement


@router.post("/issue", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
async def issue(
    body: IssueMovementRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lines = []
    item_ids: set[int] = set()
    for line in body.lines:
        unit = db.query(SerializedUnit).filter(SerializedUnit.serial == line.serial).first()
        if not unit:
            raise HTTPException(status_code=404, detail=f"Serial {line.serial} not found")
        if unit.status == UnitStatus.DESTROYED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unit {line.serial} is destroyed and cannot be issued",
            )
        if unit.status == UnitStatus.ISSUED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unit {line.serial} is already issued",
            )
        from_location_id = unit.currentLocationId
        unit.status = UnitStatus.ISSUED
        unit.currentLocationId = None
        db.flush()
        item_ids.add(unit.itemId)
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
    db.flush()
    log_action(
        db,
        "ISSUE",
        user_id=current_user.id,
        resource_type="movement",
        resource_id=movement.id,
        detail={"issuedToId": body.issuedToId, "lineCount": len(lines), "note": body.note},
        request=request,
    )
    db.commit()
    db.refresh(movement)

    await _broadcast_movement(movement)
    for iid in item_ids:
        low = _check_low_stock(db, iid)
        if low:
            await ws_manager.broadcast({"event": "low_stock_alert", **low})

    return movement


@router.post("/return", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
async def return_movement(
    body: ReturnMovementRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lines = []
    for line in body.lines:
        unit = db.query(SerializedUnit).filter(SerializedUnit.serial == line.serial).first()
        if not unit:
            raise HTTPException(status_code=404, detail=f"Serial {line.serial} not found")
        if unit.status == UnitStatus.DESTROYED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unit {line.serial} is destroyed and cannot be returned",
            )
        if unit.status != UnitStatus.ISSUED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unit {line.serial} cannot be returned: it is not currently issued (status: {unit.status})",
            )
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
    db.flush()
    log_action(
        db,
        "RETURN",
        user_id=current_user.id,
        resource_type="movement",
        resource_id=movement.id,
        detail={"lineCount": len(lines), "note": body.note},
        request=request,
    )
    db.commit()
    db.refresh(movement)

    await _broadcast_movement(movement)
    return movement


@router.get("", response_model=List[MovementOut])
def list_movements(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
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

