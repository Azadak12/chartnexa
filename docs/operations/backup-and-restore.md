# Backup and restore

Status: **scripts written and drilled locally; production backups not set up.** Hosting, the database service and object storage are not chosen (docs/05, Q32), so nothing here runs anywhere yet.

## What must be backed up
| Data | Where | How | Status |
|---|---|---|---|
| Database (accounts, courses, lessons, access, orders, reviews, progress, audit) | PostgreSQL | Managed point-in-time recovery, plus daily logical dumps with `ops/backup/pg-backup.sh` | Scripts ready; hosting pending |
| Uploaded files and videos | Object storage (provider pending, Q32) | Provider versioning and cross-region replication | Blocked on Q32 |
| Secrets (token keys, MFA encryption key, provider keys) | Hosting secret store | Never in backups; recorded in the secret store with an owner and rotation procedure | Pending hosting |

Losing `MFA_ENCRYPTION_KEY` makes stored authenticator secrets unreadable: staff would need MFA resets. Losing `ACCESS_TOKEN_SECRET` signs everyone out, which is harmless.

## Proposed objectives (owner to confirm)
- **RPO:** 15 minutes with managed point-in-time recovery; 24 hours with dumps alone.
- **RTO:** 2 hours for the database.
- **Retention:** daily dumps for 35 days, monthly for 12 months, encrypted at rest. Access is limited to operators and audited.

## Scripts
Both read connection details only from libpq variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` or `.pgpass`, `PGDATABASE`, `PGSSLMODE`), so no password appears in arguments or logs.

- `ops/backup/pg-backup.sh <dir>`: custom-format dump without ownership or grants, written atomically. It adds a `.sha256` file next to the dump, creates files readable only by the owner (`umask 077`), and prints the path.
- `ops/backup/pg-restore-verify.sh <file> [--keep]`: verifies the checksum, refusing files without one or with a mismatch. It restores into a new database with a fresh name (never an existing one) and checks that every repository migration is applied and finished. It then prints row counts for the main tables and drops the scratch database unless `--keep` is given.

## Restore procedure (production, once hosting exists)
1. Declare the incident and stop writes: scale the API to zero or turn on maintenance mode.
2. Choose the recovery point: point-in-time recovery to just before the fault, or the newest verified dump.
3. Restore into a new database. Never restore over the damaged one, which is kept for investigation.
4. Run `pg-restore-verify.sh` (or the equivalent checks on a point-in-time restore). Compare row counts and recent audit events with expectations.
5. Point `DATABASE_URL` at the restored database and start one API instance.
6. Check `/health/ready`, a sign-in, a course page and an Admin audit read. Then scale up.
7. Record the timeline, the data lost (between the recovery point and the incident) and the follow-ups. Tell affected users if personal data or purchases are affected (policy pending).

## Drills
Run a restore drill monthly and after every schema-changing release. Record the results below.

| Date | Where | Source | Result |
|---|---|---|---|
| 2026-11-19 | Development container, local PostgreSQL 16 (not production) | Scratch database with all 18 migrations, 250 users, 12 courses, 96 lessons, 200 entitlements | Backup and restore in about 1 s. Checksum verified, 18 of 18 migrations applied, and row counts matched the source. A tampered dump was refused (checksum mismatch, exit 1), as was a dump without a checksum file. The scratch databases were removed. |
