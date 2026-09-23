#!/usr/bin/env bash
# Exercise a custom-format backup inside the disposable PostgreSQL CI service.
# Usage: scripts/restore-drill.sh <postgres-service-container-id> <test-database>
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <postgres-service-container-id> <test-database>" >&2
  exit 2
fi

container_id="$1"
source_db="$2"
if [[ ! "$container_id" =~ ^[a-f0-9]{12,64}$ ]]; then
  echo "Expected a PostgreSQL service container ID" >&2
  exit 2
fi
if [[ ! "$source_db" =~ ^[a-z_][a-z0-9_]*$ ]] || (( ${#source_db} > 63 )); then
  echo "Expected a valid PostgreSQL test database name" >&2
  exit 2
fi

umask 077
dump_file="$(mktemp "${TMPDIR:-/tmp}/restore-drill-dump.XXXXXXXX")"
list_file="$(mktemp "${TMPDIR:-/tmp}/restore-drill-list.XXXXXXXX")"
restore_db="restore_drill_$(date +%s)_$$_${RANDOM}"
restore_created=0

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$restore_created" -eq 1 ]]; then
    if ! docker exec "$container_id" dropdb -U platform --if-exists --force "$restore_db"; then
      echo "Failed to remove restore database $restore_db" >&2
      status=1
    fi
  fi
  rm -f -- "$dump_file" "$list_file"
  exit "$status"
}
trap cleanup EXIT

server_version="$(docker exec "$container_id" psql -XAtq -v ON_ERROR_STOP=1 -U platform -d "$source_db" -c 'SHOW server_version_num')"
if [[ ! "$server_version" =~ ^17[0-9]{4}$ ]]; then
  echo "Restore drill requires PostgreSQL 17; found $server_version" >&2
  exit 1
fi

echo "Dumping CI database $source_db from PostgreSQL 17..."
docker exec "$container_id" pg_dump -U platform -d "$source_db" --format=custom --compress=6 > "$dump_file"
if [[ ! -s "$dump_file" ]]; then
  echo "pg_dump produced an empty archive" >&2
  exit 1
fi
docker exec -i "$container_id" pg_restore --list < "$dump_file" > "$list_file"
if [[ ! -s "$list_file" ]]; then
  echo "pg_restore could not list the archive" >&2
  exit 1
fi

docker exec "$container_id" createdb -U platform "$restore_db"
restore_created=1
echo "Restoring into disposable database $restore_db..."
docker exec -i "$container_id" pg_restore -U platform -d "$restore_db" --exit-on-error --no-owner --no-acl < "$dump_file"

table_query="SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')"
migration_query='SELECT count(*) FROM public."_prisma_migrations"'
count_query() {
  local database="$1" query="$2"
  docker exec "$container_id" psql -XAtq -v ON_ERROR_STOP=1 -U platform -d "$database" -c "$query"
}

source_tables="$(count_query "$source_db" "$table_query")"
restored_tables="$(count_query "$restore_db" "$table_query")"
source_migrations="$(count_query "$source_db" "$migration_query")"
restored_migrations="$(count_query "$restore_db" "$migration_query")"
for count in "$source_tables" "$restored_tables" "$source_migrations" "$restored_migrations"; do
  if [[ ! "$count" =~ ^[0-9]+$ ]]; then
    echo "A table or migration count was not numeric" >&2
    exit 1
  fi
done
if (( source_tables == 0 || source_migrations == 0 )); then
  echo "The CI database is missing public tables or Prisma migrations" >&2
  exit 1
fi
if [[ "$source_tables" != "$restored_tables" || "$source_migrations" != "$restored_migrations" ]]; then
  echo "Restore mismatch: tables $source_tables/$restored_tables; migrations $source_migrations/$restored_migrations" >&2
  exit 1
fi

echo "Restore drill passed: $restored_tables public tables and $restored_migrations Prisma migrations restored."
