# Proposal

## Why

Auth, permissions, courses and payments all need a running backend with consistent errors, request tracing, configuration and a managed database schema. The accepted ADRs (0002 backend and data, 0009 observability) define the direction, but no API exists. Building this skeleton first lets every later change plug into one error contract, one pagination convention and one migration path instead of inventing them separately.

## What Changes

- Add `apps/api`: a NestJS (TypeScript) modular-monolith skeleton, stateless and configured only through environment variables.
- Health endpoints: liveness (process is up) and readiness (database reachable), with no auth and no sensitive data.
- One error envelope for every failure: `{ code, message, requestId, fields? }`, with no stack traces or internals exposed. Its type lives in `packages/api-contracts`.
- Request IDs: accept a well-formed incoming ID or generate one, return it in a response header, include it in every log line and error body.
- Input validation at the boundary; unknown or malformed input yields a 400 with field-level detail.
- Configuration validated at startup; the process refuses to start on missing or invalid required settings.
- Cursor-pagination convention (limit cap, opaque cursor, stable ordering) as a shared helper used by later list endpoints.
- PostgreSQL connection with Prisma and a migration workflow: apply, roll back (via down-migration scripts or documented reset for dev), and a CI-run migration check against a real Postgres.
- OpenAPI document generated from the code and published at a dev-only route.
- Structured JSON logs with redaction of secrets and personal data (full tracing and metrics belong to `observability-baseline`).
- CI additions: API tests run against a Postgres service container.
- **Not included:** authentication, users, roles, any course or payment table, queues/Redis, file storage, deployment. Only a `schema_baseline`-level migration proving the pipeline works, with no product tables.

Assumptions (proposed, changeable before apply):
- Fastify adapter with NestJS, Prisma as ORM per ADR-0002, Vitest for API tests (consistent with the monorepo), pino for logging.
- Local development database: PostgreSQL 16 already installed via Homebrew on this machine. Docker is not installed here, so a Docker Compose file is optional documentation, not the required path. CI uses a Postgres service container.
- Use the latest **stable** Prisma and NestJS at apply time; Prisma 8 was still release-candidate when this was planned, so it is not assumed.

## Capabilities

### New Capabilities
- `api-platform`: observable cross-cutting API behavior: health and readiness, uniform error envelope, request IDs, input validation, startup config validation, pagination convention, log redaction, API documentation.
- `database-migrations`: how the database schema changes safely: versioned migrations, repeatable apply, tested rollback path, and a real-Postgres check in CI.

### Modified Capabilities
<!-- None. repo-quality-gates is unchanged; CI gains a job but its requirements still hold. -->

## Impact

- New: `apps/api/**`, `packages/api-contracts` additions (error envelope, pagination types), Prisma schema and migrations directory, `.env.example` entries (placeholders only), CI workflow job for API plus Postgres.
- New dependencies (verify license, support and compatibility at apply): NestJS, Fastify adapter, Prisma, pino, validation library, OpenAPI plugin.
- No user-facing behavior; no secrets; no product data.
- Out of scope: auth, RBAC, product tables, Redis/BullMQ, deployment, observability stack beyond logs.
