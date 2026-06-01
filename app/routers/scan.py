from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ItemBarcode, SerializedUnit, User
from app.schemas import BarcodeScanResponse, UnitOut

router = APIRouter(prefix="/scan", tags=["scan"])


@router.get("/barcode/{value}", response_model=BarcodeScanResponse)
def scan_barcode(
    value: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Look up items by barcode value.

    Returns ``{ items: [...], found: true/false }`` so the caller can
    distinguish "no match" from an error and decide whether to create a
    new item.
    """
    barcodes = db.query(ItemBarcode).filter(ItemBarcode.value == value).all()
    items = [b.item for b in barcodes]
    return BarcodeScanResponse(items=items, found=len(items) > 0)


@router.get("/serial/{serial}", response_model=UnitOut)
def scan_serial(
    serial: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    unit = db.query(SerializedUnit).filter(SerializedUnit.serial == serial).first()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Serial {serial} not found")
    return unit
