from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import CardColor, DeckEntry, Item, Movement, MovementLine, SerializedUnit, Shoe, ShoeStatus, UnitStatus, User
from app.routers.cards import _build_forecast, _build_inventory_summary, _build_low_stock_response
from app.schemas import DashboardCardStats, DashboardStats, LowStockItem, MovementCreatedByOut, RecentMovement

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    total_units = db.query(func.count(SerializedUnit.id)).scalar()

    status_rows = (
        db.query(SerializedUnit.status, func.count(SerializedUnit.id))
        .group_by(SerializedUnit.status)
        .all()
    )
    status_breakdown = {s.value: 0 for s in UnitStatus}
    for row_status, count in status_rows:
        status_breakdown[row_status.value] = count

    items_with_min_stock = db.query(Item).filter(Item.minStock > 0).all()
    low_stock_items = []
    for item in items_with_min_stock:
        in_stock_count = (
            db.query(func.count(SerializedUnit.id))
            .filter(
                SerializedUnit.itemId == item.id,
                SerializedUnit.status == UnitStatus.IN_STOCK,
            )
            .scalar()
        )
        if in_stock_count < item.minStock:
            low_stock_items.append(
                LowStockItem(
                    id=item.id,
                    sku=item.sku,
                    name=item.name,
                    category=item.category,
                    inStockCount=in_stock_count,
                    minStock=item.minStock,
                )
            )

    recent_movements_raw = (
        db.query(Movement).order_by(Movement.createdAt.desc()).limit(10).all()
    )
    recent_movements = []
    for m in recent_movements_raw:
        lines_count = db.query(func.count(MovementLine.id)).filter(MovementLine.movementId == m.id).scalar()
        recent_movements.append(
            RecentMovement(
                id=m.id,
                type=m.type,
                note=m.note,
                createdAt=m.createdAt,
                createdBy=MovementCreatedByOut(
                    id=m.createdBy.id,
                    username=m.createdBy.username,
                    email=m.createdBy.email,
                    role=m.createdBy.role,
                ),
                linesCount=lines_count,
            )
        )

    return DashboardStats(
        totalUnits=total_units,
        statusBreakdown=status_breakdown,
        lowStockItems=low_stock_items,
        recentMovements=recent_movements,
    )


@router.get("/card-stats", response_model=DashboardCardStats)
def get_card_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    inventory = _build_inventory_summary(db)
    low_stock = _build_low_stock_response(db)
    forecast = _build_forecast(db)
    recent_entries = db.query(DeckEntry).order_by(DeckEntry.createdAt.desc()).limit(5).all()
    return DashboardCardStats(
        inventory=inventory,
        recentEntries=recent_entries,
        lowStock=low_stock,
        forecast=forecast,
    )

