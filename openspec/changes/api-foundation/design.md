# Design

## Context

Monorepo exists (pnpm, Turborepo, Node 26, strict TypeScript, Vitest, secretlint, CI with `check` and `audit` jobs; main protected). `apps/` is empty. Accepted ADRs: 0002 (NestJS modular monolith, PostgreSQL, Prisma with raw SQL for partial unique indexes and locks), 0009 (OpenTelemetry-ready logs, request IDs, no PII in logs), 0006 (idempotency keys later). Local machine has PostgreSQL 16 via Homebrew and no Docker. See proposal.md for scope.

## Goals / Non-Goals

**Goals:** a runnable, tested API skeleton; one error contract; one request-ID contract; a migration pipeline proven in CI; shared types in `packages/api-contracts`.
**Non-Goals:** auth, domain modules, product tables, Redis/queues, tracing/metrics backends, deployment, rate limiting (arrives with auth).

## Decisions

1. **NestJS with the Fastify adapter.** Faster than Express and fits the performance goals; Nest guards and interceptors host later authorization. Alternative: Express adapter (more middleware, slower). Verify Fastify adapter compatibility with the chosen Nest version at apply.
2. **Module skeleton:** `apps/api/src/{platform,health,config,database}` plus an empty `modules/` folder; later domains live under `modules/<domain>` with lint-enforced import boundaries (no cross-module deep imports). A boundary lint rule is added now so it exists before domains do.
3. **Errors:** a global exception filter maps known exceptions to the envelope; unknown errors become a generic 500. The envelope type is defined once in `packages/api-contracts` and imported by the API (and later mobile).
4. **Request IDs:** a Fastify hook accepts `X-Request-Id` only if it matches a strict pattern and length (for example 8-64 chars of letters, digits, hyphen), otherwise generates a UUID. Carried on the Fastify request (`req.id`) and bound into every log line by the request-scoped logger, so no separate async-local store is needed (implementation deviation from the first draft, same observable behavior).
5. **Validation:** schema validation with Zod (shared with mobile forms per ADR-0001) using a Nest pipe; `strict` objects reject unknown keys. Alternative: class-validator (decorator-heavy, no sharing with mobile).
6. **Config:** a Zod-validated config object loaded once at bootstrap; failure exits with a message naming variables only. `.env.example` gains placeholders.
7. **Pagination helper:** keyset (cursor) pagination on `(sort_key, id)`; the cursor is base64url of the last key values with an HMAC signature so tampering is detected; max page size constant. The signing secret comes from config. Offset pagination is not offered.
8. **Database:** Prisma with the PostgreSQL driver, connection pool sized by config; readiness does a cheap `SELECT 1` with a short timeout. Migrations via Prisma Migrate. Prisma does not generate down migrations, so rollback is a convention: each migration folder carries a reviewed `down.sql`, and a test script applies up, runs down, and re-applies up on a scratch database. Alternative: a different migration tool (for example node-pg-migrate) with native down support; rejected for now to keep the ADR-0002 choice, revisit if rollback friction grows.
9. **Baseline migration:** creates only a `schema_baseline` bookkeeping table (or an equivalent no-op marker) so the pipeline is exercised without inventing product tables. Product tables arrive with the changes that need them.
10. **Logging:** pino JSON logs with redaction paths for authorization, cookies, tokens, passwords and common PII fields; request ID bound to every line. Tracing/metrics are left to `observability-baseline`.
11. **OpenAPI:** generated from code via Nest's OpenAPI support, served only when the environment is not production; exported to a file in CI to catch accidental contract drift.
12. **Testing:** unit tests for pipes, filters and pagination; integration tests with Nest's test app against a real Postgres (CI service container; local Homebrew Postgres via a scratch database created and dropped by the test setup). No mocked database for migration tests.
13. **CI:** add a `api` job with a `postgres:16` service container, running migrations, rollback test and API tests. Add it to required checks on `main` after it exists. Optional Docker Compose file documents a local stack for developers who have Docker.
14. **Versions:** use the latest stable releases at apply time, verify licenses, Node 26 support and peer dependencies; do not adopt release candidates. Releases inside pnpm's release-age window (NestJS 12.5.1 at apply time) are not used; pin the previous version rather than adding release-age exclusions.

## Risks / Trade-offs

- Prisma has no native down migrations -> convention plus automated up/down/up test; fallback is switching tools before many migrations exist.
- Zod in the API vs Nest ecosystem defaults -> a small pipe; fallback is class-validator.
- pnpm strictness with Nest/Prisma peer dependencies -> resolve explicitly at apply; record any `allowBuilds` additions (Prisma install scripts) deliberately.
- Local Postgres differs from CI container -> pin both to 16; document versions.
- Adding the `api` job to required checks before it is green would block merges -> add it as required only after it passes once.
- Signed cursors need a secret in config -> generated per environment, never committed, validated at startup.

## Migration Plan

New app and tables only. First migration creates the baseline marker. Rollback: revert the change; the baseline marker has no dependents.

## Open Questions

- Preferred cloud and database host remain open (Q09); nothing here depends on them.
