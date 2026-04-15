from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Location, User
from app.schemas import LocationCreate, LocationOut, LocationUpdate, LocationWithWarehouseOut

router = APIRouter(tags=["locations"])


@router.get("/warehouses/{warehouse_id}/locations", response_model=List[LocationOut])
def list_locations(
    warehouse_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Location).filter(Location.warehouseId == warehouse_id).all()


@router.post(
    "/warehouses/{warehouse_id}/locations",
    response_model=LocationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_location(
    warehouse_id: int,
    body: LocationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    location = Location(warehouseId=warehouse_id, **body.model_dump())
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.get("/locations/{location_id}", response_model=LocationWithWarehouseOut)
def get_location(
    location_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail=f"Location {location_id} not found")
    return location


@router.put("/locations/{location_id}", response_model=LocationOut)
def update_location(
    location_id: int,
    body: LocationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail=f"Location {location_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(location, field, value)
    db.commit()
    db.refresh(location)
    return location


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail=f"Location {location_id} not found")
    db.delete(location)
    db.commit()
