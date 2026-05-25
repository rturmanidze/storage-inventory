#!/bin/sh
set -e

echo "Running database migrations..."
find alembic -type d -name '__pycache__' -prune -exec rm -rf {} +
alembic upgrade head

echo "Running database seed..."
python seed.py || true

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 3010
