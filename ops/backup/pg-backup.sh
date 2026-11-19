#!/usr/bin/env bash
# Logical backup of the ChartNexa database.
#
# Connection details come ONLY from the standard libpq variables (PGHOST, PGPORT, PGUSER,
# PGPASSWORD or a .pgpass file, PGDATABASE, PGSSLMODE), so no password appears in arguments,
# the process list or logs. Writes <dir>/chartnexa-<UTC time>.dump (custom format) and a .sha256
# file next to it, and prints only the file path.
#
#   PGHOST=... PGUSER=... PGDATABASE=... ops/backup/pg-backup.sh /var/backups/chartnexa
set -euo pipefail
umask 077

dir="${1:-}"
if [[ -z "$dir" ]]; then
  echo "usage: pg-backup.sh <backup directory>" >&2
  exit 2
fi
: "${PGDATABASE:?set PGDATABASE (and PGHOST, PGUSER, credentials) in the environment}"
mkdir -p "$dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$dir/chartnexa-$stamp.dump"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

# Custom format: compressed, restorable table by table. Ownership and grants are left out so the
# dump restores into any role; roles and grants are managed by the hosting setup.
pg_dump --format=custom --no-owner --no-acl --compress=6 --file="$tmp"
mv "$tmp" "$out"
trap - EXIT
(cd "$dir" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")
echo "$out"
