from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user
from app.database import get_db
from app.models import DestructionRecord, Movement, MovementLine, Role, SerializedUnit, UnitStatus, User
from app.schemas import (
    DestroyUnitRequest,
    UnitCreate,
    UnitHistoryEvent,
    UnitOut,
    UnitStatusUpdate,
    UnitWithDestructionOut,
)
from app.websocket import manager as ws_manager

router = APIRouter(prefix="/units", tags=["units"])


@router.get("", response_model=List[UnitOut])
def list_units(
    serial: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    unit_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.models import Item

    q = db.query(SerializedUnit)
    if serial:
        q = q.filter(SerializedUnit.serial.ilike(f"%{serial}%"))
    if sku:
        q = q.join(Item).filter(Item.sku.ilike(f"%{sku}%"))
    if unit_status:
        q = q.filter(SerializedUnit.status == unit_status)
    return q.all()


@router.get("/{unit_id}/history", response_model=List[UnitHistoryEvent])
def get_unit_history(
    unit_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return the full lifecycle history for a single unit."""
    unit = db.query(SerializedUnit).filter(SerializedUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unit {unit_id} not found")

    events: List[UnitHistoryEvent] = []

    # Creation event
    events.append(UnitHistoryEvent(
        eventType="CREATED",
        timestamp=unit.createdAt,
        detail=f"Unit created with serial {unit.serial}",
    ))

    # Movement events
    lines = (
        db.query(MovementLine)
        .join(Movement, MovementLine.movementId == Movement.id)
        .filter(MovementLine.serialUnitId == unit_id)
        .order_by(Movement.createdAt.asc())
        .all()
    )
    for line in lines:
        movement = line.movement
        performer = movement.createdBy.username if movement.createdBy else "unknown"
        from_loc = line.fromLocation.code if line.fromLocation else None
        to_loc = line.toLocation.code if line.toLocation else None
        issued_to = line.issuedTo.name if line.issuedTo else None

        detail_parts = [f"Type: {movement.type.value}"]
        if from_loc:
            detail_parts.append(f"from {from_loc}")
        if to_loc:
            detail_parts.append(f"to {to_loc}")
        if issued_to:
            detail_parts.append(f"issued to {issued_to}")
        if movement.note:
            detail_parts.append(f"note: {movement.note}")

        events.append(UnitHistoryEvent(
            eventType=movement.type.value,
            timestamp=movement.createdAt,
            performedBy=performer,
            detail=" — ".join(detail_parts),
            movementId=movement.id,
            fromLocation=from_loc,
            toLocation=to_loc,
            issuedTo=issued_to,
        ))

    # Destruction event (if any)
    destruction = db.query(DestructionRecord).filter(DestructionRecord.unitId == unit_id).first()
    if destruction:
        destroyer = destruction.destroyedBy.username if destruction.destroyedBy else "unknown"
        events.append(UnitHistoryEvent(
            eventType="DESTROYED",
            timestamp=destruction.destroyedAt,
            performedBy=destroyer,
            detail=f"Destroyed — reason: {destruction.reason}",
        ))

    events.sort(key=lambda e: e.timestamp)
    return events


@router.get("/{unit_id}", response_model=UnitWithDestructionOut)
def get_unit(
    unit_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    unit = db.query(SerializedUnit).filter(SerializedUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unit {unit_id} not found")
    unit.destructionRecord = (
        db.query(DestructionRecord).filter(DestructionRecord.unitId == unit_id).first()
    )
    return unit


@router.post("", response_model=UnitOut, status_code=status.HTTP_201_CREATED)
def create_unit(
    body: UnitCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    unit = SerializedUnit(**body.model_dump())
    db.add(unit)
    db.flush()
    log_action(
        db,
        "CREATE_UNIT",
        user_id=current_user.id,
        resource_type="unit",
        resource_id=unit.id,
        detail={"serial": unit.serial, "itemId": unit.itemId},
        request=request,
    )
    db.commit()
    db.refresh(unit)
    return unit


@router.patch("/{unit_id}/status", response_model=UnitOut)
async def update_unit_status(
    unit_id: int,
    body: UnitStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change a unit's status (e.g. mark as DAMAGED, EXPIRED, QUARANTINED).
    DESTROYED status must use the dedicated /destroy endpoint."""
    unit = db.query(SerializedUnit).filter(SerializedUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unit {unit_id} not found")
    if unit.status == UnitStatus.DESTROYED:
        raise HTTPException(status_code=400, detail="Destroyed units cannot be modified")
    if body.status == UnitStatus.DESTROYED:
        raise HTTPException(status_code=400, detail="Use the /destroy endpoint to destroy a unit")

    old_status = unit.status
    unit.status = body.status
    unit.updatedAt = datetime.utcnow()
    log_action(
        db,
        "UPDATE_UNIT_STATUS",
        user_id=current_user.id,
        resource_type="unit",
        resource_id=unit_id,
        detail={"serial": unit.serial, "from": old_status.value, "to": body.status.value, "reason": body.reason},
        request=request,
    )
    db.commit()
    db.refresh(unit)

    await ws_manager.broadcast({
        "event": "inventory_update",
        "unitId": unit_id,
        "serial": unit.serial,
        "status": unit.status.value,
    })
    return unit


@router.post("/{unit_id}/destroy", response_model=UnitWithDestructionOut)
async def destroy_unit(
    unit_id: int,
    body: DestroyUnitRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently mark a unit as destroyed. Requires ADMIN or MANAGER role."""
    if current_user.role not in (Role.ADMIN, Role.MANAGER):
        raise HTTPException(status_code=403, detail="Only ADMIN or MANAGER can destroy units")
    unit = db.query(SerializedUnit).filter(SerializedUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unit {unit_id} not found")
    if unit.status == UnitStatus.DESTROYED:
        raise HTTPException(status_code=400, detail="Unit is already destroyed")

    unit.status = UnitStatus.DESTROYED
    unit.currentLocationId = None
    unit.updatedAt = datetime.utcnow()

    record = DestructionRecord(
        unitId=unit_id,
        destroyedById=current_user.id,
        reason=body.reason,
        destroyedAt=datetime.utcnow(),
    )
    db.add(record)
    log_action(
        db,
        "DESTROY_UNIT",
        user_id=current_user.id,
        resource_type="unit",
        resource_id=unit_id,
        detail={"serial": unit.serial, "reason": body.reason},
        request=request,
    )
    db.commit()
    db.refresh(unit)
    db.refresh(record)

    unit.destructionRecord = record

    await ws_manager.broadcast({
        "event": "inventory_update",
        "unitId": unit_id,
        "serial": unit.serial,
        "status": "DESTROYED",
    })
    return unit


