from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Item, ItemBarcode, User
from app.schemas import BarcodeCreate, BarcodeOut, ItemCreate, ItemOut, ItemUpdate

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=List[ItemOut])
def list_items(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Item)
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            Item.sku.ilike(pattern) | Item.name.ilike(pattern) | Item.category.ilike(pattern)
        )
    return q.all()


@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    body: ItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = Item(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=ItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
    return item


@router.put("/{item_id}", response_model=ItemOut)
def update_item(
    item_id: int,
    body: ItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item {item_id} not found")
    db.delete(item)
    db.commit()


@router.get("/{item_id}/barcodes", response_model=List[BarcodeOut])
def list_barcodes(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(ItemBarcode).filter(ItemBarcode.itemId == item_id).all()


@router.post("/{item_id}/barcodes", response_model=BarcodeOut, status_code=status.HTTP_201_CREATED)
def add_barcode(
    item_id: int,
    body: BarcodeCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    barcode = ItemBarcode(itemId=item_id, value=body.value)
    db.add(barcode)
    db.commit()
    db.refresh(barcode)
    return barcode


@router.delete("/{item_id}/barcodes/{barcode_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_barcode(
    item_id: int,
    barcode_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    barcode = (
        db.query(ItemBarcode)
        .filter(ItemBarcode.id == barcode_id, ItemBarcode.itemId == item_id)
        .first()
    )
    if not barcode:
        raise HTTPException(status_code=404, detail=f"Barcode {barcode_id} not found")
    db.delete(barcode)
    db.commit()
