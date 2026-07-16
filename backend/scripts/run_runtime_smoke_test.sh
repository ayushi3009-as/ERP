#!/usr/bin/env bash
# Runtime Validation smoke test — actually starts the FastAPI app against
# a disposable Postgres and issues real HTTP requests against it. This is
# the piece that was missing after migration validation: "the schema is
# right" (scripts/run_migration_validation.sh) is a different question
# from "the app actually boots and answers requests" (this script).
#
# Usage:
#   cd backend
#   bash scripts/run_runtime_smoke_test.sh
#
# Requires: Docker, this project's Python deps installed
# (pip install -r requirements.txt), and a real SECRET_KEY exported
# (this script sets one for the disposable run automatically).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.validation.yml"

cleanup() {
  echo ""
  echo "Stopping app process and disposable database..."
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting disposable Postgres..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for it to be healthy..."
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' microerp-postgres-validation 2>/dev/null || echo "starting")
  [ "$status" = "healthy" ] && break
  [ "$i" -eq 30 ] && { echo "ERROR: Postgres did not become healthy in time." >&2; exit 1; }
  sleep 1
done

export DATABASE_URL="postgresql://microerp:microerp@localhost:55432/microerp_validation"
export SECRET_KEY="runtime-smoke-test-only-not-for-real-use-$(date +%s)"
export ENVIRONMENT="test"   # skips the Alembic version gate; this script's job is "does it boot", not "is the schema migrated" (that's the other script)
export CORS_ORIGINS="http://localhost:3000"

cd "$BACKEND_DIR"
echo "Running migrations..."
alembic upgrade head

echo "Starting the app in the background..."
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8123 &
APP_PID=$!

echo "Waiting for the app to accept connections..."
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:8123/health > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "ERROR: app did not respond on /health in time." >&2
    exit 1
  fi
  sleep 1
done

echo ""
echo "Running smoke assertions..."
python3 scripts/runtime_smoke_assertions.py
exit_code=$?

exit $exit_code
