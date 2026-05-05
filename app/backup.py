"""Database backup and restore utilities using pg_dump / psql."""
import gzip
import logging
import os
import re
import shutil
import subprocess
from datetime import datetime, timedelta
from typing import List
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

BACKUP_DIR = os.environ.get("BACKUP_DIR", "/backups")
BACKUP_RETENTION_DAYS = int(os.environ.get("BACKUP_RETENTION_DAYS", "30"))

# Allowed filename pattern — prevents arbitrary path injection via filenames
_FILENAME_RE = re.compile(r"^backup_[\d]{4}-[\d]{2}-[\d]{2}_[\d]{2}-[\d]{2}\.sql\.gz$")
# Date-dir pattern YYYY-MM-DD
_DATE_DIR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parse_db_url(db_url: str) -> dict:
    parsed = urlparse(db_url)
    return {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "user": parsed.username or "",
        "password": parsed.password or "",
        "dbname": (parsed.path or "").lstrip("/"),
    }


def _safe_filepath(backup_dir: str, date_dir: str, filename: str) -> str:
    """Resolve path and verify it stays inside backup_dir."""
    if not _DATE_DIR_RE.match(date_dir):
        raise ValueError(f"Invalid date directory: {date_dir!r}")
    if not _FILENAME_RE.match(filename):
        raise ValueError(f"Invalid backup filename: {filename!r}")
    base = os.path.realpath(backup_dir)
    filepath = os.path.realpath(os.path.join(base, date_dir, filename))
    if not filepath.startswith(base + os.sep):
        raise ValueError("Path traversal detected")
    return filepath


def create_backup(db_url: str, backup_dir: str = BACKUP_DIR) -> dict:
    """Create a compressed pg_dump backup.

    Returns a metadata dict with keys:
        filename, filepath, date_dir, created_at, size_bytes
    """
    params = _parse_db_url(db_url)
    now = datetime.utcnow()
    date_dir = now.strftime("%Y-%m-%d")
    dir_path = os.path.join(backup_dir, date_dir)
    os.makedirs(dir_path, exist_ok=True)

    filename = f"backup_{now.strftime('%Y-%m-%d_%H-%M')}.sql.gz"
    filepath = os.path.join(dir_path, filename)

    env = os.environ.copy()
    env["PGPASSWORD"] = params["password"]

    dump_cmd = [
        "pg_dump",
        "--clean",
        "--if-exists",
        "-h", params["host"],
        "-p", params["port"],
        "-U", params["user"],
        params["dbname"],
    ]

    try:
        result = subprocess.run(
            dump_cmd,
            env=env,
            capture_output=True,
            timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr.decode(errors='replace')}")

        with gzip.open(filepath, "wb", compresslevel=9) as fh:
            fh.write(result.stdout)

        size_bytes = os.path.getsize(filepath)
        logger.info("Backup created: %s (%d bytes)", filepath, size_bytes)
        return {
            "filename": filename,
            "filepath": filepath,
            "date_dir": date_dir,
            "path": f"{date_dir}/{filename}",
            "created_at": now.isoformat(),
            "size_bytes": size_bytes,
        }
    except Exception:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise


def restore_backup(filepath: str, db_url: str) -> None:
    """Restore the database from a compressed SQL backup file.

    Streams the decompressed SQL to psql.  The dump must have been created with
    ``--clean --if-exists`` so that existing objects are dropped before creation.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Backup file not found: {filepath}")

    params = _parse_db_url(db_url)
    env = os.environ.copy()
    env["PGPASSWORD"] = params["password"]

    with gzip.open(filepath, "rb") as fh:
        sql_content = fh.read()

    restore_cmd = [
        "psql",
        "-h", params["host"],
        "-p", params["port"],
        "-U", params["user"],
        "-d", params["dbname"],
        "--set", "ON_ERROR_STOP=off",
        "-q",
    ]

    result = subprocess.run(
        restore_cmd,
        env=env,
        input=sql_content,
        capture_output=True,
        timeout=600,
    )
    # psql exits 3 when ON_ERROR_STOP=off and errors occur (e.g. DROP IF NOT EXISTS on missing table).
    # We treat returncode 0 and 3 as success.
    if result.returncode not in (0, 3):
        raise RuntimeError(f"Restore failed (exit {result.returncode}): {result.stderr.decode(errors='replace')}")

    logger.info("Database restored from: %s", filepath)


def list_backups(backup_dir: str = BACKUP_DIR) -> List[dict]:
    """Return all backup files sorted newest-first."""
    if not os.path.exists(backup_dir):
        return []

    backups: List[dict] = []
    for date_dir in sorted(os.listdir(backup_dir), reverse=True):
        if not _DATE_DIR_RE.match(date_dir):
            continue
        date_path = os.path.join(backup_dir, date_dir)
        if not os.path.isdir(date_path):
            continue
        for fname in sorted(os.listdir(date_path), reverse=True):
            if not _FILENAME_RE.match(fname):
                continue
            fpath = os.path.join(date_path, fname)
            stat = os.stat(fpath)
            backups.append(
                {
                    "filename": fname,
                    "date_dir": date_dir,
                    "path": f"{date_dir}/{fname}",
                    "size_bytes": stat.st_size,
                    "created_at": datetime.utcfromtimestamp(stat.st_mtime).isoformat(),
                }
            )
    return backups


def cleanup_old_backups(
    backup_dir: str = BACKUP_DIR, keep_days: int = BACKUP_RETENTION_DAYS
) -> int:
    """Delete backup directories older than *keep_days* days.

    Returns the number of directories removed.
    """
    if not os.path.exists(backup_dir):
        return 0

    cutoff = datetime.utcnow() - timedelta(days=keep_days)
    removed = 0

    for date_dir in os.listdir(backup_dir):
        if not _DATE_DIR_RE.match(date_dir):
            continue
        date_path = os.path.join(backup_dir, date_dir)
        if not os.path.isdir(date_path):
            continue
        try:
            dir_date = datetime.strptime(date_dir, "%Y-%m-%d")
        except ValueError:
            continue
        if dir_date < cutoff:
            shutil.rmtree(date_path)
            removed += 1
            logger.info("Removed old backup directory: %s", date_path)

    return removed
