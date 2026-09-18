#!/usr/bin/env bash
# PostgreSQL backup — run daily via cron.
# Cron example (as deploy user):
#   0 3 * * * /opt/barber-platform/infra/vps/backup.sh
set -euo pipefail

APP_DIR="/opt/barber-platform"
BACKUP_DIR="/opt/barber-platform/backups"
COMPOSE_FILE="compose.production.yaml"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "$(date -Iseconds) Starting PostgreSQL backup..."

# Dump using the running postgres container
docker compose -f "$APP_DIR/$COMPOSE_FILE" exec -T postgres \
  pg_dump -U platform -d platform --format=custom --compress=6 \
  > "$BACKUP_DIR/platform_${TIMESTAMP}.dump"

BACKUP_SIZE=$(du -h "$BACKUP_DIR/platform_${TIMESTAMP}.dump" | cut -f1)
echo "$(date -Iseconds) Backup created: platform_${TIMESTAMP}.dump ($BACKUP_SIZE)"

# Rotate old backups
DELETED=$(find "$BACKUP_DIR" -name "platform_*.dump" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "$(date -Iseconds) Rotated $DELETED backup(s) older than ${RETENTION_DAYS} days."
fi

echo "$(date -Iseconds) Backup completed."
