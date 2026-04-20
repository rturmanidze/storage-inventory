from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user
from app.database import get_db
from app.models import Item, ItemBarcode, SerializedUnit, UnitStatus, User
from app.schemas import BarcodeCreate, BarcodeOut, ItemCreate, ItemCreateWithBarcode, ItemOut, ItemUpdate

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=List[ItemOut])
def list_items(
    search: Optional[str] = Query(None),
    low_stock: Optional[bool] = Query(None, alias="lowStock"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Item)
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            Item.sku.ilike(pattern) | Item.name.ilike(pattern) | Item.category.ilike(pattern)
        )
    if low_stock:
        # Return only items whose in-stock count is below their minStock threshold
        in_stock_subq = (
            db.query(SerializedUnit.itemId, func.count(SerializedUnit.id).label("cnt"))
            .filter(SerializedUnit.status == UnitStatus.IN_STOCK)
            .group_by(SerializedUnit.itemId)
            .subquery()
        )
        q = q.outerjoin(in_stock_subq, Item.id == in_stock_subq.c.itemId).filter(
            Item.minStock > 0,
            (func.coalesce(in_stock_subq.c.cnt, 0)) < Item.minStock,
        )
    return q.all()


@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    body: ItemCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = Item(**body.model_dump())
    db.add(item)
    db.flush()
    log_action(
        db,
        "CREATE_ITEM",
        user_id=current_user.id,
        resource_type="item",
        resource_id=item.id,
        detail={"sku": item.sku, "name": item.name, "category": item.category},
        request=request,
    )
    db.commit()
    db.refresh(item)
    return item


@router.post("/with-barcode", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item_with_barcode(
    body: ItemCreateWithBarcode,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new item and attach a barcode in a single operation.

    Used by the Receive Stock workflow when a scanned barcode is not yet
    in the system, so the user can register a new item on the spot.
    """
    # Check barcode uniqueness
    existing = db.query(ItemBarcode).filter(ItemBarcode.value == body.barcode).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Barcode '{body.barcode}' is already assigned to another item",
        )
    # Check SKU uniqueness
    existing_item = db.query(Item).filter(Item.sku == body.sku).first()
    if existing_item:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An item with SKU '{body.sku}' already exists",
        )

    item = Item(
        sku=body.sku,
        name=body.name,
        description=body.description,
        category=body.category,
        supplier=body.supplier,
        batch=body.batch,
        unit=body.unit or "pcs",
        minStock=body.minStock or 0,
    )
    db.add(item)
    db.flush()

    barcode = ItemBarcode(itemId=item.id, value=body.barcode)
    db.add(barcode)
    db.flush()

    log_action(
        db,
        "CREATE_ITEM_FROM_BARCODE",
        user_id=current_user.id,
        resource_type="item",
        resource_id=item.id,
        detail={
            "sku": item.sku,
            "name": item.name,
            "category": item.category,
            "barcode": body.barcode,
            "source": "receive_stock_scan",
        },
        request=request,
    )
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
@router.patch("/{item_id}", response_model=ItemOut)
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
