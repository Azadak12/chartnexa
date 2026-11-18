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
- **Staff:** `POST /staff/courses` (`course:create`), `GET /staff/courses` and `GET /staff/courses/:id` (`course:update`), `PATCH /staff/courses/:id` (`course:update`, must send `expectedVersion`), `POST /staff/courses/:id/publish` and `/unpublish` (`course:publish`). Admins and Managers hold these permissions by default; Instructors get them only through grants (below). For an Instructor, the list shows only courses they hold an update grant on, and any other course id answers 403 (same body whether it exists or not).
- **Safety:** an edit based on an older version answers 409 (the update is a compare-and-swap on the version, so of two simultaneous edits exactly one wins). Publishing needs a title and a description. Price is whole US cents from 0 to 1,000,000 (also enforced by database constraints). Every create, update, publish and unpublish is audited.
- **First course for a phone test:** make an existing, verified account an Admin, sign in with it in the app, open Profile, then Manage courses.
```bash
pnpm --filter @chartnexa/api admin:bootstrap -- --email you@example.com
```

## Instructor permissions (change `instructor-permission-delegation`)
- An Instructor starts with nothing. An Admin or Manager gives individual permissions: create course (whole academy), and update course, publish course, upload lessons, schedule live, read students, read reports (each for one named course). Other permissions can never be granted (also enforced by a database CHECK).
- **Endpoints (`instructor_permissions:manage`, Admin and Manager):** `GET /staff/instructors/:id/permissions` (grants plus what you may grant), `POST /staff/instructors/:id/grants` (`{ permission, courseId?, reason }`; repeating it changes nothing and answers `created: false`), `POST /staff/instructors/:id/grants/:grantId/revoke` (`{ reason }`). Reasons are 3 to 200 characters. Everything is audited, including denied attempts. Appoint the Instructor first with `PUT /staff/users/:id/role`.
- **Manager ceiling (proposal R08):** Managers may grant everything grantable except `course:publish`; the list is `MANAGER_CEILING` in `modules/access/grants/grants.service.ts`.
- **Automatic grants (proposal R09):** an Instructor with the create grant who makes a course gets update, lessons, live, students and reports on it, never publish. Audited as `grant.owner_auto`.
- **Ending (proposal R10):** removing or replacing the Instructor role, or deleting the account, ends every grant in the same transaction. Grants of a disabled account or of anyone who is not an active Instructor never take effect. `GET /me/access` reports your own grants (`courseGrants`); the server re-checks on every request.

## Lessons (change `course-lessons-basic`)
- **What a lesson is:** plain text (title 1 to 120 characters, body up to 20,000, markup is stored and shown as typed), a position, and a free-preview flag. A course holds up to 200, as one flat ordered list (decision R11).
- **Public:** `GET /courses/:courseId/lessons` (outline: id, title, position, preview flag, never text) and `GET /courses/:courseId/lessons/:lessonId` (text of free-preview lessons only; others answer 403 with code `ENROLLMENT_REQUIRED`). Draft and unknown courses answer the same 404. `GET /courses/:id` now also carries `lessonCount` and `previewCount`.
- **Staff (`lesson:upload`, for an Instructor a grant on that course):** `GET` and `POST /staff/courses/:courseId/lessons` (`POST` needs an `idempotencyKey` of 8 to 100 characters; sending it again returns the same lesson), `GET`, `PATCH` (needs `expectedVersion`) and `DELETE /staff/courses/:courseId/lessons/:lessonId`, and `PUT /staff/courses/:courseId/lessons/order` (send every lesson id once; any difference answers 409 `LESSON_ORDER_CHANGED`). A 201st lesson answers 409 `LESSON_LIMIT_REACHED`. The permission name says "upload" but covers authoring text; no files are uploaded yet.
- **Order and concurrency:** adds, deletes and reorders first take a row lock on the course, so positions are always 1..N; the database also refuses a duplicate position at commit. Edits are compare-and-swap on the lesson's version.
- **Audit:** `lesson.create`, `lesson.update`, `lesson.delete`, `lesson.reorder`, in the same transaction as the change; they hold ids and field names, never lesson text.

## Entitlements (change `entitlements-core`)
- **What it is:** one record per person and course saying they may learn it (ADR-0006). Source is `admin_grant` only for now; status is `active` or `revoked`. The database allows one active record per person and course; revoked records stay as history.
- **Staff (`enrollments:manage`, Admins and Managers):** `GET /staff/courses/:courseId/entitlements` (people with access, newest first, paged; shows name and email to staff only), `POST /staff/courses/:courseId/entitlements` with `{ userId, reason }` (always 200; `created: false` when they already had access; the person must be active with a verified email, else 409; unknown or deleted answers 404), and `POST /staff/courses/:courseId/entitlements/:entitlementId/revoke` with `{ reason }` (repeating it changes nothing). Reasons are 3 to 200 characters. Instructors have no way to grant (decision R17). Find a person's id with `GET /staff/users/lookup?email=`.
- **You:** `GET /me/courses` lists your own active courses, newest first, paged. Unpublished courses stay, with `onSale: false` (decision R15).
- **Access rule:** a locked lesson opens for a signed-in person with an active entitlement, decided from the database on every request (no cache, no token claim), so a grant or revoke applies to the very next request with the same token. Owners also keep reading an unpublished course; everyone else still gets 404.
- **Optional sign-in:** `GET /courses/:id`, `/courses/:id/lessons` and `/courses/:id/lessons/:lessonId` accept a token when there is one. A missing, malformed, expired or revoked token means "signed out"; it never fails the request. `GET /courses/:id` now carries `enrolled` and `onSale`.
- **Audit:** `entitlement.grant` and `entitlement.revoke`, in the same transaction as the change, with ids, source and reason and never an email address.

