#!/usr/bin/env bash
# Restores a backup into a NEW scratch database and checks it, without touching any existing
# database. Use it for restore drills and to prove each backup is usable.
#
# The server comes from the libpq variables (PGHOST, PGPORT, PGUSER, credentials). The role needs
# CREATEDB. PGDATABASE is ignored for the restore target; a fresh name is always used.
#
#   ops/backup/pg-restore-verify.sh /var/backups/chartnexa/chartnexa-20261119T000000Z.dump [--keep]
#
# Checks: checksum, restore without errors, every migration in the repository applied and
# finished, and a row count for each main table (printed for comparison with the source).
set -euo pipefail

file="${1:-}"
keep="${2:-}"
if [[ -z "$file" || ! -f "$file" ]]; then
  echo "usage: pg-restore-verify.sh <file.dump> [--keep]" >&2
  exit 2
fi
here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../../apps/api/prisma/migrations"

if [[ -f "$file.sha256" ]]; then
  (cd "$(dirname "$file")" && sha256sum --check --quiet "$(basename "$file").sha256")
  echo "checksum ok"
else
  echo "no checksum file next to the backup; refusing to restore an unverified file" >&2
  exit 1
fi

target="chartnexa_restore_$(date -u +%Y%m%d%H%M%S)_$RANDOM"
admin_db="${RESTORE_ADMIN_DB:-postgres}"
psql --dbname="$admin_db" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$target\"" >/dev/null
cleanup() {
  if [[ "$keep" != "--keep" ]]; then
    psql --dbname="$admin_db" -qc "DROP DATABASE IF EXISTS \"$target\"" >/dev/null || true
  fi
}
trap cleanup EXIT

pg_restore --dbname="$target" --no-owner --no-acl --exit-on-error "$file"
echo "restored into $target"

expected="$(find "$migrations" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
applied="$(psql --dbname="$target" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")"
unfinished="$(psql --dbname="$target" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL")"
echo "migrations: $applied applied, $unfinished unfinished, $expected in the repository"
if [[ "$unfinished" != "0" || "$applied" -lt "$expected" ]]; then
  echo "restore check FAILED: migrations incomplete or behind the repository" >&2
  exit 1
fi

echo "row counts:"
for t in users sessions courses lessons entitlements orders payment_events lesson_completions \
  reviews lesson_resources lesson_videos live_sessions announcements audit_events; do
  n="$(psql --dbname="$target" -Atc "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "missing")"
  printf '  %-20s %s\n' "$t" "$n"
  if [[ "$n" == "missing" ]]; then
    echo "restore check FAILED: table $t is missing" >&2
    exit 1
  fi
done
echo "restore check PASSED${keep:+ (database $target kept)}"
