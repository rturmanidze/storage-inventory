"""Reporting endpoints — CSV exports for inventory, movements, and user activity."""
import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import AuditLog, Movement, MovementLine, Role, SerializedUnit, User
from app.schemas import DashboardStats

router = APIRouter(prefix="/reports", tags=["reports"])

_privileged = require_roles(Role.ADMIN, Role.MANAGER)


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    if not rows:
        output = io.StringIO()
        output.write("No data\n")
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/inventory/csv")
def export_inventory_csv(
    db: Session = Depends(get_db),
    _: User = Depends(_privileged),
):
    """Export current inventory status as CSV."""
    units = db.query(SerializedUnit).all()
    rows = []
    for u in units:
        item = u.item
        loc = u.currentLocation
        warehouse = loc.warehouse if loc else None
        rows.append({
            "unit_id": u.id,
            "serial": u.serial,
            "status": u.status.value,
            "sku": item.sku if item else "",
            "item_name": item.name if item else "",
            "category": item.category or "",
            "supplier": item.supplier or "",
            "warehouse": warehouse.name if warehouse else "",
            "location": loc.code if loc else "",
            "created_at": u.createdAt.isoformat(),
            "updated_at": u.updatedAt.isoformat(),
        })
    return _csv_response(rows, "inventory_export.csv")


@router.get("/movements/csv")
def export_movements_csv(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _: User = Depends(_privileged),
):
    """Export movement history as CSV."""
    q = db.query(Movement)
    if from_date:
        q = q.filter(Movement.createdAt >= datetime.fromisoformat(from_date))
    if to_date:
        q = q.filter(Movement.createdAt <= datetime.fromisoformat(to_date))
    movements = q.order_by(Movement.createdAt.desc()).all()

    rows = []
    for m in movements:
        for line in m.lines:
            unit = line.serialUnit
            item = unit.item if unit else None
            rows.append({
                "movement_id": m.id,
                "movement_type": m.type.value,
                "created_at": m.createdAt.isoformat(),
                "created_by": m.createdBy.username if m.createdBy else "",
                "note": m.note or "",
                "serial": unit.serial if unit else "",
                "sku": item.sku if item else "",
                "item_name": item.name if item else "",
                "from_location": line.fromLocation.code if line.fromLocation else "",
                "to_location": line.toLocation.code if line.toLocation else "",
                "issued_to": line.issuedTo.name if line.issuedTo else "",
            })
    return _csv_response(rows, "movements_export.csv")


@router.get("/activity/csv")
def export_user_activity_csv(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _: User = Depends(_privileged),
):
    """Export user activity (audit log) as CSV."""
    q = db.query(AuditLog)
    if from_date:
        q = q.filter(AuditLog.createdAt >= datetime.fromisoformat(from_date))
    if to_date:
        q = q.filter(AuditLog.createdAt <= datetime.fromisoformat(to_date))
    logs = q.order_by(AuditLog.createdAt.desc()).limit(5000).all()

    rows = []
    for log in logs:
        rows.append({
            "log_id": log.id,
            "timestamp": log.createdAt.isoformat(),
            "user": log.user.username if log.user else f"id:{log.userId}",
            "action": log.action,
            "resource_type": log.resourceType or "",
            "resource_id": log.resourceId or "",
            "ip_address": log.ipAddress or "",
            "detail": log.detail or "",
        })
    return _csv_response(rows, "user_activity_export.csv")


@router.get("/summary")
def get_report_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Summary statistics for the reports dashboard."""
    from app.models import Item, UnitStatus

    total_units = db.query(func.count(SerializedUnit.id)).scalar() or 0

    status_rows = (
        db.query(SerializedUnit.status, func.count(SerializedUnit.id))
        .group_by(SerializedUnit.status)
        .all()
    )
    status_breakdown = {s.value: 0 for s in UnitStatus}
    for row_status, count in status_rows:
        status_breakdown[row_status.value] = count

    # Movements per day in the last 30 days
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=30)
    daily_movements = (
        db.query(
            func.date_trunc("day", Movement.createdAt).label("day"),
            func.count(Movement.id).label("count"),
        )
        .filter(Movement.createdAt >= cutoff)
        .group_by("day")
        .order_by("day")
        .all()
    )

    return {
        "totalUnits": total_units,
        "statusBreakdown": status_breakdown,
        "dailyMovements": [
            {"day": row.day.date().isoformat(), "count": row.count}
            for row in daily_movements
        ],
    }
