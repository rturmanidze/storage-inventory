"""Helper to write audit log entries."""
import json
from datetime import datetime
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog


def log_action(
    db: Session,
    action: str,
    *,
    user_id: Optional[int] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[Any] = None,
    detail: Optional[dict] = None,
    request: Optional[Request] = None,
) -> None:
    """Append an immutable audit log record. Call before db.commit()."""
    ip = None
    if request is not None:
        forwarded_for = request.headers.get("X-Forwarded-For")
        ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host if request.client else None

    entry = AuditLog(
        userId=user_id,
        action=action,
        resourceType=resource_type,
        resourceId=str(resource_id) if resource_id is not None else None,
        detail=json.dumps(detail) if detail else None,
        ipAddress=ip,
        createdAt=datetime.utcnow(),
    )
    db.add(entry)
