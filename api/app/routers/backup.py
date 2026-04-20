"""Backup management API — list, create, download, restore, and delete backups.

All endpoints are restricted to the ADMIN role.
"""
import os
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import require_roles
from app.backup import (
    BACKUP_DIR,
    _safe_filepath,
    cleanup_old_backups,
    create_backup,
    list_backups,
    restore_backup,
)
from app.database import get_db
from app.models import Role, User

router = APIRouter(prefix="/backups", tags=["backups"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class BackupInfo(BaseModel):
    filename: str
    date_dir: str
    path: str
    size_bytes: int
    created_at: str


class RestoreRequest(BaseModel):
    confirmed: bool


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=List[BackupInfo])
def list_all_backups(
    _: User = Depends(require_roles(Role.ADMIN)),
):
    """Return all available backup files, newest first."""
    return list_backups(BACKUP_DIR)


@router.post("", response_model=BackupInfo, status_code=status.HTTP_201_CREATED)
def create_manual_backup(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    """Trigger an on-demand backup immediately."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL not configured")

    try:
        meta = create_backup(db_url, BACKUP_DIR)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc

    log_action(
        db,
        "CREATE_BACKUP",
        user_id=current_user.id,
        resource_type="backup",
        resource_id=meta["filename"],
        detail={
            "filename": meta["filename"],
            "size_bytes": meta["size_bytes"],
            "type": "manual",
        },
        request=request,
    )
    db.commit()

    return BackupInfo(
        filename=meta["filename"],
        date_dir=meta["date_dir"],
        path=meta["path"],
        size_bytes=meta["size_bytes"],
        created_at=meta["created_at"],
    )


@router.get("/download/{date_dir}/{filename}")
def download_backup(
    date_dir: str,
    filename: str,
    _: User = Depends(require_roles(Role.ADMIN)),
):
    """Download a backup file as an attachment."""
    try:
        filepath = _safe_filepath(BACKUP_DIR, date_dir, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")

    return FileResponse(
        path=filepath,
        media_type="application/gzip",
        filename=filename,
    )


@router.post("/restore/{date_dir}/{filename}", status_code=status.HTTP_200_OK)
def restore_from_backup(
    date_dir: str,
    filename: str,
    body: RestoreRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    """Restore the database from a named backup file.

    Requires ``confirmed: true`` in the request body as an explicit safety gate.
    """
    if not body.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Restore requires explicit confirmation (confirmed: true)",
        )

    try:
        filepath = _safe_filepath(BACKUP_DIR, date_dir, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL not configured")

    # Log *before* running restore so the record survives even if restore fails
    log_action(
        db,
        "RESTORE_BACKUP",
        user_id=current_user.id,
        resource_type="backup",
        resource_id=f"{date_dir}/{filename}",
        detail={
            "filename": filename,
            "date_dir": date_dir,
            "initiated_at": datetime.utcnow().isoformat(),
        },
        request=request,
    )
    db.commit()

    try:
        restore_backup(filepath, db_url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}") from exc

    return {"message": f"Database successfully restored from {filename}"}


@router.delete("/{date_dir}/{filename}", status_code=status.HTTP_204_NO_CONTENT)
def delete_backup(
    date_dir: str,
    filename: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    """Permanently delete a backup file."""
    try:
        filepath = _safe_filepath(BACKUP_DIR, date_dir, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")

    os.remove(filepath)

    # Remove the date directory if it is now empty — derive path from
    # the already-validated filepath to avoid raw user-input in path ops.
    date_path = os.path.dirname(filepath)
    if os.path.isdir(date_path) and not os.listdir(date_path):
        os.rmdir(date_path)

    log_action(
        db,
        "DELETE_BACKUP",
        user_id=current_user.id,
        resource_type="backup",
        resource_id=f"{date_dir}/{filename}",
        detail={"filename": filename, "date_dir": date_dir},
        request=request,
    )
    db.commit()
