from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User, Warehouse
from app.schemas import WarehouseCreate, WarehouseOut, WarehouseUpdate

router = APIRouter(prefix="/warehouses", tags=["warehouses"])


@router.get("", response_model=List[WarehouseOut])
def list_warehouses(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Warehouse).all()


@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse(
    body: WarehouseCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    warehouse = Warehouse(**body.model_dump())
    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.get("/{warehouse_id}", response_model=WarehouseOut)
def get_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail=f"Warehouse {warehouse_id} not found")
    return warehouse


@router.put("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(
    warehouse_id: int,
    body: WarehouseUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail=f"Warehouse {warehouse_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(warehouse, field, value)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.delete("/{warehouse_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail=f"Warehouse {warehouse_id} not found")
    db.delete(warehouse)
    db.commit()
