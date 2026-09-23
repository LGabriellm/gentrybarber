#!/usr/bin/env bash
# PostgreSQL backup — run daily via cron.
# Cron example (as deploy user):
#   0 3 * * * bash /opt/barber-platform/current/infra/vps/backup.sh
set -euo pipefail

APP_DIR="${BARBER_APP_DIR:-/opt/barber-platform}"
BACKUP_DIR="$APP_DIR/backups"
ENV_FILE="$APP_DIR/.env.production"
COMPOSE_FILE="$APP_DIR/current/compose.production.yaml"
RELEASE_FILE="$APP_DIR/current/RELEASE_ID"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

if [[ ! -f "$ENV_FILE" || ! -f "$COMPOSE_FILE" || ! -f "$RELEASE_FILE" ]]; then
  echo "Production env or active release is missing; refusing to back up" >&2
  exit 1
fi
RELEASE_ID="$(cat "$RELEASE_FILE")"
if [[ ! "$RELEASE_ID" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]; then
  echo "Active release ID is invalid" >&2
  exit 1
fi
export RELEASE_ID
compose() {
  docker compose --project-directory "$APP_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

umask 077
mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"
TEMP_DUMP="$(mktemp "$BACKUP_DIR/.platform_${TIMESTAMP}.XXXXXX.dump")"
trap 'rm -f "$TEMP_DUMP"' EXIT

echo "$(date -Iseconds) Starting PostgreSQL backup..."

compose config --quiet
compose exec -T postgres \
  pg_dump -U platform -d platform --format=custom --compress=6 \
  > "$TEMP_DUMP"
if [[ ! -s "$TEMP_DUMP" ]]; then
  echo "PostgreSQL returned an empty dump" >&2
  exit 1
fi
compose exec -T postgres pg_restore --list < "$TEMP_DUMP" > /dev/null

FINAL_DUMP="$BACKUP_DIR/platform_${TIMESTAMP}.dump"
if [[ -e "$FINAL_DUMP" ]]; then
  echo "Backup name already exists: $FINAL_DUMP" >&2
  exit 1
fi
mv "$TEMP_DUMP" "$FINAL_DUMP"

BACKUP_SIZE=$(du -h "$FINAL_DUMP" | cut -f1)
echo "$(date -Iseconds) Backup created: platform_${TIMESTAMP}.dump ($BACKUP_SIZE)"

# Rotate old backups
DELETED=$(find "$BACKUP_DIR" -name "platform_*.dump" -mtime +$((RETENTION_DAYS - 1)) -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "$(date -Iseconds) Rotated $DELETED backup(s) older than ${RETENTION_DAYS} days."
fi

echo "$(date -Iseconds) Backup completed."
