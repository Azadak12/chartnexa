# Tasks

## 1. API app skeleton

- [x] 1.1 Verify latest stable NestJS, Fastify adapter, Prisma, pino and Zod versions (licenses, Node 26 support, peer dependencies); record choices in `apps/api/README.md`; verify `pnpm install --frozen-lockfile` and the audit pass.
- [x] 1.2 Create `apps/api` with module folders (`platform`, `health`, `config`, `database`, `modules/`) and a boundary lint rule; verify a deliberate cross-module deep import fails lint, then remove it.
- [x] 1.3 Add startup config validation and `.env.example` placeholders; verify unit tests for valid config, missing variable (names the variable, never a secret) and invalid value.

## 2. Platform behavior

- [x] 2.1 Add request-ID handling with async-local context; verify tests for valid supplied ID echoed, malformed or oversized ID replaced, and ID present in logs.
- [x] 2.2 Add the error envelope type to `packages/api-contracts` and a global exception filter; verify tests for 404, validation 400, and unhandled 500 with no stack trace or internal detail in the body.
- [x] 2.3 Add the Zod validation pipe with strict objects; verify tests for field-level 400 detail and rejection of unknown properties.
- [x] 2.4 Add pino logging with redaction; verify a test that an Authorization header, cookie and token never appear in captured log output.
- [x] 2.5 Add liveness and readiness endpoints; verify tests for healthy state and for database-down state (readiness fails in the envelope, liveness still passes).

## 3. Database and migrations

- [x] 3.1 Add Prisma with the PostgreSQL connection from config and a baseline migration; verify applying to an empty scratch database succeeds and a second apply changes nothing.
- [x] 3.2 Add the down-migration convention and an up/down/up test script; verify it passes locally on a scratch database and fails when a `down.sql` is deliberately broken.
- [x] 3.3 Add database test setup that creates and drops a scratch database on the local Postgres 16; verify integration tests run end to end and leave no databases behind.

## 4. Pagination and documentation

- [x] 4.1 Add the signed-cursor pagination helper and shared types; verify tests for page cap, stable paging with inserts between pages, and tampered cursor returning 400.
- [x] 4.2 Add OpenAPI generation (non-production only) and export in CI; verify the document lists the health endpoints and the error schema, and the route is absent when `NODE_ENV=production`.

## 5. CI and documentation

- [x] 5.1 Add an `api` CI job with a `postgres:16` service running migrations, the rollback test and API tests; verify it is green on a pull request and red when a migration is deliberately broken.
- [x] 5.2 After the `api` job has passed once, add it to the required checks on `main`; verify a failing `api` job blocks merge state.
- [x] 5.3 Update `CONTRIBUTING.md`, `apps/api/README.md` (run, test, migrate, roll back, add a module) and the layout in `docs/05_TECH_STACK_AND_ARCHITECTURE.md`; verify by following the docs in a fresh clone.
- [x] 5.4 Run the full `pnpm check` and API suite from a fresh clone and record the output; verify startup with a missing required variable exits nonzero without printing secrets.

## Evidence

- 5.1: PR 6 CI is green for `check`, `api` and `audit`. A throwaway PR with a deliberately broken migration (`CREATE TABEL`) failed both `api` and `check` and showed `mergeStateStatus: BLOCKED`; it was closed unmerged. The first CI run exposed two real defects (turbo not passing the test database variable; Prisma client and contracts not built before OpenAPI export), both fixed.
- 5.2: `api` was added to the required checks on `main` (now `check`, `audit`, `api`, strict) after it passed once. The blocked state above is under that protection. Merging was not attempted.
- 5.3/5.4: fresh clone of the branch: `pnpm install --frozen-lockfile`, `pnpm check` exit 0 (26 API tests, 2 contracts tests, plus design-tokens and shared-types), `pnpm migrate:roundtrip` OK, and starting without DATABASE_URL and CURSOR_SECRET exits 1 naming both variables without any secret value. No scratch databases left behind.
- Local test runs use the Homebrew PostgreSQL 16 on the developer machine; CI uses a `postgres:16` service container with trust auth.

## Workflow follow-up

- Review, then archive after verification. Next proposals: `mobile-shell-and-tokens` and `observability-baseline`.
