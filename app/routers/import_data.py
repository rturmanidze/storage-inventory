import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import Item, ItemBarcode, Location, Role, SerializedUnit, User, Warehouse
from app.schemas import ImportError, ImportResult

router = APIRouter(prefix="/import", tags=["import"])


def _parse_file(file: UploadFile) -> List[dict]:
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content = file.file.read()

    if ext == "csv":
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        return [
            {k.strip(): (v.strip() if v else "") for k, v in row.items()}
            for row in reader
        ]
    elif ext in ("xlsx", "xls"):
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(c).strip() if c is not None else "" for c in rows[0]]
        result = []
        for row in rows[1:]:
            obj = {headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row)}
            result.append(obj)
        return result
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or XLSX.")


@router.post("/items", response_model=ImportResult)
def import_items(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    rows = _parse_file(file)
    success = 0
    errors: List[ImportError] = []

    for i, row in enumerate(rows):
        row_num = i + 2
        try:
            if not row.get("sku") or not row.get("name"):
                errors.append(ImportError(row=row_num, message="Missing required fields: sku, name"))
                continue
            existing = db.query(Item).filter(Item.sku == row["sku"]).first()
            if existing:
                existing.name = row["name"]
                existing.category = row.get("category") or None
                existing.unit = row.get("unit") or "pcs"
                existing.minStock = int(row["minStock"]) if row.get("minStock") else 0
            else:
                db.add(Item(
                    sku=row["sku"],
                    name=row["name"],
                    category=row.get("category") or None,
                    unit=row.get("unit") or "pcs",
                    minStock=int(row["minStock"]) if row.get("minStock") else 0,
                ))
            db.commit()
            success += 1
        except Exception as e:
            db.rollback()
            errors.append(ImportError(row=row_num, message=str(e)))

    return ImportResult(success=success, errors=errors)


@router.post("/locations", response_model=ImportResult)
def import_locations(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    rows = _parse_file(file)
    success = 0
    errors: List[ImportError] = []

    for i, row in enumerate(rows):
        row_num = i + 2
        try:
            if not row.get("code") or (not row.get("warehouseId") and not row.get("warehouseName")):
                errors.append(ImportError(row=row_num, message="Missing required fields: code, warehouseId or warehouseName"))
                continue
            warehouse_id = int(row["warehouseId"]) if row.get("warehouseId") else None
            if not warehouse_id and row.get("warehouseName"):
                wh = db.query(Warehouse).filter(Warehouse.name == row["warehouseName"]).first()
                if not wh:
                    errors.append(ImportError(row=row_num, message=f'Warehouse "{row["warehouseName"]}" not found'))
                    continue
                warehouse_id = wh.id
            existing = (
                db.query(Location)
                .filter(Location.warehouseId == warehouse_id, Location.code == row["code"])
                .first()
            )
            if existing:
                existing.description = row.get("description") or None
            else:
                db.add(Location(
                    warehouseId=warehouse_id,
                    code=row["code"],
                    description=row.get("description") or None,
                ))
            db.commit()
            success += 1
        except Exception as e:
            db.rollback()
            errors.append(ImportError(row=row_num, message=str(e)))

    return ImportResult(success=success, errors=errors)


@router.post("/barcodes", response_model=ImportResult)
def import_barcodes(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    rows = _parse_file(file)
    success = 0
    errors: List[ImportError] = []

    for i, row in enumerate(rows):
        row_num = i + 2
        try:
            if not row.get("sku") or not row.get("barcode"):
                errors.append(ImportError(row=row_num, message="Missing required fields: sku, barcode"))
                continue
            item = db.query(Item).filter(Item.sku == row["sku"]).first()
            if not item:
                errors.append(ImportError(row=row_num, message=f'Item with sku "{row["sku"]}" not found'))
                continue
            existing = (
                db.query(ItemBarcode)
                .filter(ItemBarcode.itemId == item.id, ItemBarcode.value == row["barcode"])
                .first()
            )
            if not existing:
                db.add(ItemBarcode(itemId=item.id, value=row["barcode"]))
                db.commit()
            success += 1
        except Exception as e:
            db.rollback()
            errors.append(ImportError(row=row_num, message=str(e)))

    return ImportResult(success=success, errors=errors)


@router.post("/units", response_model=ImportResult)
def import_units(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    rows = _parse_file(file)
    success = 0
    errors: List[ImportError] = []

    for i, row in enumerate(rows):
        row_num = i + 2
        try:
            if not row.get("sku") or not row.get("serial"):
                errors.append(ImportError(row=row_num, message="Missing required fields: sku, serial"))
                continue
            item = db.query(Item).filter(Item.sku == row["sku"]).first()
            if not item:
                errors.append(ImportError(row=row_num, message=f'Item with sku "{row["sku"]}" not found'))
                continue
            existing = db.query(SerializedUnit).filter(SerializedUnit.serial == row["serial"]).first()
            if not existing:
                db.add(SerializedUnit(serial=row["serial"], itemId=item.id))
                db.commit()
            success += 1
        except Exception as e:
            db.rollback()
            errors.append(ImportError(row=row_num, message=str(e)))

    return ImportResult(success=success, errors=errors)


@router.post("/placements", response_model=ImportResult)
def import_placements(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    rows = _parse_file(file)
    success = 0
    errors: List[ImportError] = []

    for i, row in enumerate(rows):
        row_num = i + 2
        try:
            if not row.get("serial") or not row.get("locationCode") or (
                not row.get("warehouseId") and not row.get("warehouseName")
            ):
                errors.append(ImportError(row=row_num, message="Missing required fields: serial, locationCode, warehouseId or warehouseName"))
                continue
            warehouse_id = int(row["warehouseId"]) if row.get("warehouseId") else None
            if not warehouse_id and row.get("warehouseName"):
                wh = db.query(Warehouse).filter(Warehouse.name == row["warehouseName"]).first()
                if not wh:
                    errors.append(ImportError(row=row_num, message=f'Warehouse "{row["warehouseName"]}" not found'))
                    continue
                warehouse_id = wh.id
            location = (
                db.query(Location)
                .filter(Location.warehouseId == warehouse_id, Location.code == row["locationCode"])
                .first()
            )
            if not location:
                errors.append(ImportError(row=row_num, message=f'Location "{row["locationCode"]}" not found in warehouse'))
                continue
            unit = db.query(SerializedUnit).filter(SerializedUnit.serial == row["serial"]).first()
            if not unit:
                errors.append(ImportError(row=row_num, message=f'Serial "{row["serial"]}" not found'))
                continue
            unit.currentLocationId = location.id
            db.commit()
            success += 1
        except Exception as e:
            db.rollback()
            errors.append(ImportError(row=row_num, message=str(e)))

    return ImportResult(success=success, errors=errors)
