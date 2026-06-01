"""Background scheduler for automated daily database backups."""
import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.backup import BACKUP_DIR, cleanup_old_backups, create_backup

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_daily_backup() -> None:
    """Execute a scheduled backup and prune old files."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        logger.error("DATABASE_URL not set — skipping scheduled backup")
        return
    try:
        meta = create_backup(db_url, BACKUP_DIR)
        logger.info("Scheduled backup completed: %s (%d bytes)", meta["filename"], meta["size_bytes"])
        removed = cleanup_old_backups(BACKUP_DIR)
        if removed:
            logger.info("Removed %d old backup director(ies)", removed)
    except Exception as exc:  # noqa: BLE001
        logger.error("Scheduled backup failed: %s", exc, exc_info=True)


def start_scheduler() -> None:
    """Start the APScheduler background scheduler with a daily backup job."""
    global _scheduler  # noqa: PLW0603
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _run_daily_backup,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="daily_backup",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.start()
    logger.info("Backup scheduler started — daily job at 02:00 UTC")


def stop_scheduler() -> None:
    """Gracefully stop the scheduler on application shutdown."""
    global _scheduler  # noqa: PLW0603
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Backup scheduler stopped")
