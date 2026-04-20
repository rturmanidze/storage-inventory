"""Reporting endpoints — CSV exports for inventory, movements, and user activity."""
import csv
import io
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import AuditLog, CardColor, CardMaterial, DeckEntry, Movement, MovementLine, Role, SerializedUnit, Shoe, ShoeStatus, User
from app.schemas import CardReportSummary, DashboardStats, DeckConsumptionDay

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


# ── Casino Card Reports ────────────────────────────────────────────────────────

CARDS_PER_DECK = 52
DECKS_PER_SHOE = 8


def _get_available_decks_report(db: Session, color: CardColor) -> int:
    """Mirrors the calculation in cards.py without importing it to avoid circular deps.

    Available = total_added - holding_shoes*8 - cards_destroyed_shoes*8
    See cards.py _get_available_decks for full accounting explanation.
    """
    total_added = (
        db.query(func.coalesce(func.sum(DeckEntry.deckCount), 0))
        .filter(DeckEntry.color == color)
        .scalar()
        or 0
    )
    holding_shoes = (
        db.query(func.count(Shoe.id))
        .filter(
            Shoe.color == color,
            Shoe.status.in_([ShoeStatus.IN_WAREHOUSE, ShoeStatus.SENT_TO_STUDIO, ShoeStatus.REFILLED]),
        )
        .scalar()
        or 0
    )
    cards_destroyed_shoes = (
        db.query(func.count(Shoe.id))
        .filter(
            Shoe.color == color,
            Shoe.destroyedAt.isnot(None),
        )
        .scalar()
        or 0
    )
    return int(total_added) - (int(holding_shoes) + int(cards_destroyed_shoes)) * DECKS_PER_SHOE


def _get_available_decks_by_material_report(db: Session, material: CardMaterial) -> int:
    """Available decks for a specific material across all colors."""
    total_added = int(
        db.query(func.coalesce(func.sum(DeckEntry.deckCount), 0))
        .filter(DeckEntry.material == material)
        .scalar() or 0
    )
    holding_shoes = int(
        db.query(func.count(Shoe.id))
        .filter(
            Shoe.material == material,
            Shoe.status.in_([ShoeStatus.IN_WAREHOUSE, ShoeStatus.SENT_TO_STUDIO, ShoeStatus.REFILLED]),
        )
        .scalar() or 0
    )
    cards_destroyed_shoes = int(
        db.query(func.count(Shoe.id))
        .filter(Shoe.material == material, Shoe.destroyedAt.isnot(None))
        .scalar() or 0
    )
    return total_added - (holding_shoes + cards_destroyed_shoes) * DECKS_PER_SHOE


@router.get("/cards/summary", response_model=CardReportSummary)
def get_card_report_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Casino card inventory summary report with daily consumption trends."""
    black_decks = _get_available_decks_report(db, CardColor.BLACK)
    red_decks = _get_available_decks_report(db, CardColor.RED)
    total_decks = black_decks + red_decks
    plastic_decks = _get_available_decks_by_material_report(db, CardMaterial.PLASTIC)
    paper_decks = _get_available_decks_by_material_report(db, CardMaterial.PAPER)

    shoes_in_warehouse = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.IN_WAREHOUSE).scalar() or 0
    )
    shoes_sent = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.SENT_TO_STUDIO).scalar() or 0
    )
    shoes_returned = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.RETURNED).scalar() or 0
    )
    shoes_cards_destroyed = int(
        db.query(func.count(Shoe.id))
        .filter(Shoe.status.in_([ShoeStatus.CARDS_DESTROYED, ShoeStatus.DESTROYED]))
        .scalar()
        or 0
    )
    shoes_empty = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE).scalar() or 0
    )
    shoes_refilled = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.REFILLED).scalar() or 0
    )
    shoes_physically_damaged = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.PHYSICALLY_DAMAGED).scalar() or 0
    )
    shoes_physically_destroyed = int(
        db.query(func.count(Shoe.id)).filter(Shoe.status == ShoeStatus.PHYSICALLY_DESTROYED).scalar() or 0
    )
    total_shoes = (
        db.query(func.count(Shoe.id)).scalar() or 0
    )
    plastic_shoes = int(
        db.query(func.count(Shoe.id)).filter(Shoe.material == CardMaterial.PLASTIC).scalar() or 0
    )
    paper_shoes = int(
        db.query(func.count(Shoe.id)).filter(Shoe.material == CardMaterial.PAPER).scalar() or 0
    )

    # Daily deck consumption over last 30 days (decks consumed = shoes created * 8 - shoes returned * 8)
    cutoff = datetime.utcnow() - timedelta(days=30)

    created_rows = (
        db.query(
            func.date_trunc("day", Shoe.createdAt).label("day"),
            func.count(Shoe.id).label("shoes_created"),
        )
        .filter(Shoe.createdAt >= cutoff)
        .group_by("day")
        .order_by("day")
        .all()
    )

    returned_rows = (
        db.query(
            func.date_trunc("day", Shoe.returnedAt).label("day"),
            func.count(Shoe.id).label("shoes_returned"),
        )
        .filter(Shoe.returnedAt >= cutoff)
        .group_by("day")
        .order_by("day")
        .all()
    )

    # Merge into a per-day dict
    daily: dict[str, dict] = {}
    for row in created_rows:
        day_str = row.day.date().isoformat()
        daily.setdefault(day_str, {"shoesCreated": 0, "shoesReturned": 0})
        daily[day_str]["shoesCreated"] += row.shoes_created
    for row in returned_rows:
        day_str = row.day.date().isoformat()
        daily.setdefault(day_str, {"shoesCreated": 0, "shoesReturned": 0})
        daily[day_str]["shoesReturned"] += row.shoes_returned

    daily_consumption = [
        DeckConsumptionDay(
            day=day,
            shoesCreated=vals["shoesCreated"],
            shoesReturned=vals["shoesReturned"],
            decksConsumed=(vals["shoesCreated"] - vals["shoesReturned"]) * DECKS_PER_SHOE,
        )
        for day, vals in sorted(daily.items())
    ]

    return CardReportSummary(
        totalBlackDecks=black_decks,
        totalRedDecks=red_decks,
        totalDecks=total_decks,
        totalBlackCards=black_decks * CARDS_PER_DECK,
        totalRedCards=red_decks * CARDS_PER_DECK,
        totalCards=total_decks * CARDS_PER_DECK,
        totalPlasticDecks=plastic_decks,
        totalPaperDecks=paper_decks,
        totalPlasticCards=plastic_decks * CARDS_PER_DECK,
        totalPaperCards=paper_decks * CARDS_PER_DECK,
        shoesCreated=int(total_shoes),
        shoesInWarehouse=shoes_in_warehouse,
        shoesSentToStudio=shoes_sent,
        shoesReturned=shoes_returned,
        shoesCardsDestroyed=shoes_cards_destroyed,
        shoesEmpty=shoes_empty,
        shoesRefilled=shoes_refilled,
        shoesPhysicallyDamaged=shoes_physically_damaged,
        shoesPhysicallyDestroyed=shoes_physically_destroyed,
        shoesDestroyed=shoes_cards_destroyed + shoes_physically_destroyed,
        totalShoes=int(total_shoes),
        plasticShoesCreated=plastic_shoes,
        paperShoesCreated=paper_shoes,
        dailyConsumption=daily_consumption,
    )


@router.get("/cards/shoes/csv")
def export_destroyed_shoes_csv(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    """Export shoe records as CSV. Filter by status (e.g. DESTROYED)."""
    q = db.query(Shoe)
    if status_filter:
        try:
            q = q.filter(Shoe.status == ShoeStatus(status_filter))
        except ValueError:
            pass
    shoes = q.order_by(Shoe.createdAt.desc()).all()

    rows = []
    for s in shoes:
        rows.append({
            "shoe_id": s.id,
            "shoe_number": s.shoeNumber,
            "color": s.color.value,
            "status": s.status.value,
            "created_at": s.createdAt.isoformat(),
            "created_by": s.createdBy.username if s.createdBy else "",
            "sent_at": s.sentAt.isoformat() if s.sentAt else "",
            "returned_at": s.returnedAt.isoformat() if s.returnedAt else "",
            "cards_destroyed_at": s.destroyedAt.isoformat() if s.destroyedAt else "",
            "cards_destroyed_by": s.destroyedBy.username if s.destroyedBy else "",
            "cards_destroy_reason": s.destroyReason or "",
            "recovered_at": s.recoveredAt.isoformat() if s.recoveredAt else "",
            "recovered_by": s.recoveredBy.username if s.recoveredBy else "",
            "physical_damage_at": s.physicalDamageAt.isoformat() if s.physicalDamageAt else "",
            "physical_damage_by": s.physicalDamageBy.username if s.physicalDamageBy else "",
            "physical_damage_reason": s.physicalDamageReason or "",
            "physically_destroyed_at": s.physicallyDestroyedAt.isoformat() if s.physicallyDestroyedAt else "",
            "physically_destroyed_by": s.physicallyDestroyedBy.username if s.physicallyDestroyedBy else "",
            "studio": s.studio.name if s.studio else "",
        })
    return _csv_response(rows, "shoes_export.csv")
