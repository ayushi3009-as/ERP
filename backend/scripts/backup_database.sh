#!/usr/bin/env bash
# Backup & Recovery -- addresses the gap confirmed in
# PRODUCTION_READINESS_REPORT.md ("no backup automation or documented
# recovery procedure exists"). Real pg_dump-based backup, not a
# placeholder -- but never run against a real deployment in this
# environment (no live database, no persistent storage to back up).
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/dbname \
#   BACKUP_DIR=/var/backups/microerp \
#   bash scripts/backup_database.sh
#
# Recommended: run via cron, e.g. daily at 2am:
#   0 2 * * * DATABASE_URL=... BACKUP_DIR=... /path/to/backup_database.sh >> /var/log/microerp-backup.log 2>&1

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/microerp_${TIMESTAMP}.sql.gz"

echo "Backing up to $BACKUP_FILE ..."
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: backup file is empty -- something went wrong, not treating this as success." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"

echo "Pruning backups older than $RETENTION_DAYS days ..."
find "$BACKUP_DIR" -name "microerp_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "Done. Current backups:"
ls -lh "$BACKUP_DIR"/microerp_*.sql.gz 2>/dev/null || echo "  (none yet)"

# ---- RECOVERY PROCEDURE (documented here, not just implied) ----
# To restore from a backup onto a fresh database:
#   gunzip -c /var/backups/microerp/microerp_YYYYMMDD_HHMMSS.sql.gz | \
#     psql "$DATABASE_URL"
#
# Then verify the restored database is at the expected Alembic head
# BEFORE starting the app (the app's own startup guard -- see
# main.py::_verify_alembic_version -- will refuse to boot otherwise, but
# check manually first so you know why if it does):
#   alembic current
#   alembic heads
# These two values must match.
