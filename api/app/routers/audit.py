"""Audit log endpoints — read-only for ADMIN and MANAGER."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import AuditLog, Role, User
from app.schemas import AuditLogOut

router = APIRouter(prefix="/audit", tags=["audit"])

_privileged = require_roles(Role.ADMIN, Role.MANAGER)


@router.get("", response_model=List[AuditLogOut])
def list_audit_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    _: User = Depends(_privileged),
):
    q = db.query(AuditLog)
    if user_id is not None:
        q = q.filter(AuditLog.userId == user_id)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if resource_type:
        q = q.filter(AuditLog.resourceType == resource_type)
    if from_date:
        q = q.filter(AuditLog.createdAt >= datetime.fromisoformat(from_date))
    if to_date:
        q = q.filter(AuditLog.createdAt <= datetime.fromisoformat(to_date))
    return q.order_by(AuditLog.createdAt.desc()).offset(offset).limit(limit).all()
