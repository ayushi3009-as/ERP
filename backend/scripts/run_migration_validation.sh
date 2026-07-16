#!/usr/bin/env bash
# Runs the full Migration Validation Phase against a real, disposable
# PostgreSQL container. Does NOT touch your real dev database.
#
# Usage:
#   cd backend
#   bash scripts/run_migration_validation.sh
#
# Requires: Docker, and this project's Python venv/deps installed
# (pip install -r requirements.txt).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.validation.yml"

cleanup() {
  echo ""
  echo "Tearing down disposable validation database..."
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting disposable Postgres (port 55432, tmpfs-backed, dies on teardown)..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for it to be healthy..."
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' microerp-postgres-validation 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "Postgres is healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Postgres did not become healthy in time." >&2
    exit 1
  fi
  sleep 1
done

export VALIDATION_DATABASE_URL="postgresql://microerp:microerp@localhost:55432/microerp_validation"

echo ""
echo "Running validation harness..."
cd "$BACKEND_DIR"
python3 scripts/validate_migrations.py
exit_code=$?

exit $exit_code
