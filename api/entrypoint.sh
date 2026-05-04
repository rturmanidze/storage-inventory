#!/bin/sh
set -e

echo "Running database migrations..."

# If a previous migration used a manual COMMIT (needed for ALTER TYPE ADD VALUE in
# older PostgreSQL), Alembic's transaction tracking may have been disrupted, leaving
# multiple rows in the alembic_version table.  When that happens, `alembic upgrade
# head` fails with "overlaps" because both rows are treated as current heads and
# their upgrade paths share common revisions.  The fix is to keep only the
# numerically largest (most-recent) revision and let Alembic continue from there.
python3 - <<'PYEOF'
import os, sys
try:
    from sqlalchemy import create_engine, text
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as conn:
        rows = [r[0] for r in conn.execute(text("SELECT version_num FROM alembic_version"))]
        if len(rows) > 1:
            def _ver_key(v):
                try:
                    return int(v.split("_")[0])
                except Exception:
                    return 0
            latest = max(rows, key=_ver_key)
            conn.execute(text("DELETE FROM alembic_version WHERE version_num != :v"), {"v": latest})
            conn.commit()
            print(f"alembic_version deduplication: removed stale entries, kept {latest!r}", flush=True)
except Exception as exc:
    print(f"alembic_version pre-check skipped: {exc}", flush=True)
PYEOF

alembic upgrade head

echo "Running database seed..."
python seed.py || true

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 3010
