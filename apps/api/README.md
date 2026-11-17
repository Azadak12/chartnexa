# @chartnexa/api

NestJS (Fastify) API skeleton. No auth or product tables yet.

## Dependency choices (verified 2026-11-17)
NestJS 12.4.2 (12.5.1 was inside pnpm's release-age window, so it is intentionally not used), Fastify 5.12, Prisma 7.10.1 (stable; Prisma 8 is still a release candidate and not adopted), pino 10, Zod 4, `@nestjs/swagger` 12. All MIT or Apache-2.0. Node 26 is supported by Prisma (`>=24`) and Nest (`>=20`). Do not add `minimumReleaseAgeExclude` entries to bypass pnpm's release-age check; pin an older version instead.

## Run
```bash
cp ../../.env.example .env        # then set CURSOR_SECRET (openssl rand -hex 32)
createdb chartnexa_dev            # PostgreSQL 16
pnpm migrate:deploy               # apply migrations (DATABASE_URL from your environment)
pnpm dev
```
The process exits nonzero if a required variable is missing, naming the variable but never its value.

## Test
```bash
pnpm test
```
Needs a local PostgreSQL. Tests create a uniquely named scratch database, migrate it, and drop it afterwards (`TEST_DATABASE_ADMIN_URL`, default: your OS user on `localhost:5432`).

## Migrations and rollback
- Schema lives in `prisma/schema.prisma`; migrations in `prisma/migrations/<timestamp>_<name>/migration.sql`.
- Create one: edit the schema, then `pnpm exec prisma migrate dev --name <name>`.
- **Every migration needs a reviewed `down.sql`** next to `migration.sql` (Prisma does not generate one).
- `pnpm migrate:roundtrip` applies migrations to a scratch database, re-applies (must be a no-op), runs the latest `down.sql`, and applies again. CI runs it.
- Production rollback steps must be written in the pull request before any destructive migration ships.

## Add a domain module
1. Create `src/modules/<name>/` with an `index.ts` that exports only the module's public surface.
2. Import other modules only through their `index.js`. ESLint fails deep imports and sibling-internal imports.
3. Throw errors via Nest exceptions; the global filter produces the `ErrorEnvelope`. Validate input with `ZodPipe` and `z.strictObject`.
4. Use `buildPage` and `pageParamsSchema` (`src/pagination`) for list endpoints: keyset queries only, never OFFSET.

## Conventions
- Errors: `{ code, message, requestId, fields? }` (type in `@chartnexa/api-contracts`).
- `X-Request-Id` is accepted only if 8-64 chars of letters, digits or hyphen; otherwise a UUID is generated. It is returned in the response header and logged.
- Logs are JSON (pino) with credentials, cookies, tokens and email redacted.
- OpenAPI JSON is served at `/openapi.json` outside production only.
- Known follow-up: Fastify 5 deprecates `requestIdLogLabel`; migrate to a `LogController` before Fastify 6.
