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

## Authentication (change `auth-accounts-sessions`)

First-party email and password. Routes: `/auth/register|login|refresh|logout|logout-all|email/verify|email/resend|password/forgot|password/reset` and `/me`, `/me/password`, `/me/sessions`. Protect a route with `@Authenticated()` and read the caller with `@CurrentUser()` (both from `modules/identity`).

- **Passwords:** Argon2id from Node's built-in `crypto.argon2`, 64 MiB, 2 passes, 1 lane. Measured about 63 ms per hash on a developer laptop (`pnpm bench:argon2` fails outside 50-150 ms; retune `ARGON2_PARAMS` for the real host). Hashes carry their parameters and are upgraded at login. Policy: 10-128 characters, not equal to the email, not on a small built-in common list (replace with a larger vetted list before launch).
- **Access tokens:** 10-minute HS256 JWT with only `sub`, `sid`, `jti`, `iat`, `exp`. No email, role or permission claims. Rotate `ACCESS_TOKEN_SECRET` by moving the old value to `ACCESS_TOKEN_SECRET_PREVIOUS` for one token lifetime.
- **Per-request check:** the guard verifies the token and then reads one session+user row by primary key, so logout, disabling and deletion take effect immediately.
- **Refresh tokens:** random, stored only as SHA-256 hashes, rotated on every use. Reusing a rotated token (or two simultaneous refreshes with one token) revokes the whole session. 30-day sliding expiry, 90-day cap.
- **Rate limits:** counters in PostgreSQL (`rate_limits`), so all instances agree. Failed logins count per email and per address; defaults are in `config.ts` (`RL_*`). Set `TRUST_PROXY=true` only behind a trusted proxy that sets `X-Forwarded-For`; otherwise the socket address is used.
- **Email:** the `Mailer` interface has `dev` (writes to a git-ignored `.dev-mail/` directory, never to logs) and `memory` (tests). Both are rejected at startup when `NODE_ENV=production` until a real provider exists.
- **Database time:** connections force a UTC session timezone. Without it a non-UTC PostgreSQL server shifts JavaScript dates by hours (found in testing on a server set to Asia/Karachi).
- **Logs:** security events (`auth.login.success|failure`, `auth.refresh.reuse_detected`, `auth.session.revoked`, `auth.password.reset|changed`, `auth.account.deleted`) carry request id, user id, session id and an outcome only.
- Staff roles, MFA, social login and a real email provider are separate later changes.

## Roles, permissions and audit (change `rbac-core-and-audit`)
- **Roles:** every active account is a Student; an account may also hold one staff role (Instructor, Manager, Admin). Only Admins assign or revoke roles, always with a reason (3-200 characters). Nobody can change their own role, and the last active Admin can never be removed (concurrent changes are serialized with row locks). Staff roles need an active account with a verified email. Disabled or deleted accounts have no access, and deleting an account ends its role.
- **Permissions:** the catalog and role defaults are in `modules/access/authorization/permissions.ts`; adding a permission without deciding which roles hold it fails to compile. Instructors and Students hold none by default (grants arrive in `instructor-permission-delegation`). Manager defaults are a proposal awaiting owner approval (decision register R03).
- **Protect a route:** `@RequirePermission("course:update", { resource: (req) => ({ courseId: ... }) })` (from `modules/access`). It answers 401 when not signed in and 403 in the error envelope otherwise, reads the user's role from the database on every request (once per request), and never trusts token contents. Pass `auditDenied` for sensitive routes so denials are written to the audit trail.
- **Endpoints:** `GET /me/access` (informational), `GET /staff/users/lookup?email=` (exact match only), `PUT /staff/users/:id/role`, `POST /staff/users/:id/role/revoke`, `GET /staff/audit-events` (Admin only, cursor-paginated, filters actorUserId, targetId, action, outcome, from, to).
- **Audit:** `audit_events` is append-only. Database triggers reject UPDATE, DELETE and TRUNCATE; role changes write their record in the same transaction; denied attempts on role management and audit reading are recorded. Records hold ids, role names, reasons and request ids only. **Hardening for deployment:** triggers do not stop a database owner who drops them, so run the API under a database role that has only INSERT and SELECT on `audit_events` and keep migrations on a separate owner role. Retention policy is undecided (decision register Q10).

### First Admin and recovery runbook
Run by an operator who has the production `DATABASE_URL` (that access is the trust boundary). The account must already exist, be active and have a verified email.
```bash
pnpm --filter @chartnexa/api admin:bootstrap -- --email you@example.com
```
- Refuses (exit 1) if any active Admin exists. Prints only the account id; the audit record has actor kind `system` and reason `bootstrap`.
- If the only Admin cannot sign in, add `--recovery`. It adds the named account as an Admin (it does not remove the locked-out one) and the audit record is marked `role.recovery`. Afterwards an Admin can revoke the unusable account through the API.
- Run it the same way against a local database with `DATABASE_URL`, `CURSOR_SECRET` and `ACCESS_TOKEN_SECRET` set.

## Courses (change `course-catalog-basics`)
- **Public:** `GET /courses` (published only; `q` searches titles case-insensitively as plain text, `level` filters, newest published first, cursor paging, page size capped at 100) and `GET /courses/:id` (published only; drafts and unknown ids both answer 404). No sign-in needed; responses carry no staff-only fields.
- **Staff:** `POST /staff/courses` (`course:create`), `GET /staff/courses` and `GET /staff/courses/:id` (`course:update`), `PATCH /staff/courses/:id` (`course:update`, must send `expectedVersion`), `POST /staff/courses/:id/publish` and `/unpublish` (`course:publish`). Admins and Managers hold these permissions by default; Instructors need grants (a later change).
- **Safety:** an edit based on an older version answers 409 (the update is a compare-and-swap on the version, so of two simultaneous edits exactly one wins). Publishing needs a title and a description. Price is whole US cents from 0 to 1,000,000 (also enforced by database constraints). Every create, update, publish and unpublish is audited.
- **First course for a phone test:** make an existing, verified account an Admin, sign in with it in the app, open Profile, then Manage courses.
```bash
pnpm --filter @chartnexa/api admin:bootstrap -- --email you@example.com
```
