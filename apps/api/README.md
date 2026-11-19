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

## Lesson progress (change `lesson-progress-basic`)
- **What it is:** a completion is "this person finished this lesson" (a manual mark for text lessons, decision R18). Only owners of a course (active entitlement) record progress (R19). It is the person's own learning data: nothing is audited, and logs hold ids only.
- **Endpoints (signed in; the person always comes from the token):** `PUT /me/courses/:courseId/lessons/:lessonId/completion` (mark; repeating it keeps the first time and still answers 200), `DELETE` on the same path (unmark; also safe to repeat), and `GET /me/courses/:courseId/progress` (`completed`, `total`, `nextLessonId`, and the completed lessons with times). Without an active entitlement they answer 403 `ENROLLMENT_REQUIRED` before anything else is checked; an unknown lesson or one from another course answers 404.
- **Numbers:** progress is completed lessons that still exist divided by lessons in the course now, so adding a lesson lowers it and deleting one never lifts it above the total. The next lesson is the first incomplete one by position, or `null`. `GET /me/courses` items carry `progress`, computed for the whole page in one query. `GET /courses/:id` carries `progress` and `nextLessonId` for an owner and `null` for everyone else.
- **Database:** `lesson_completions` has one row per person and lesson; a composite foreign key proves the lesson belongs to the course and removes completions with the lesson. Account deletion removes the person's completions in the same transaction.

## Staff two-step sign-in (change `staff-mfa`)
- **Who:** people with an active Admin or Manager role (decision R21). Instructors and Students sign in as before.
- **Sign-in:** `POST /auth/login` answers a correct password from an Admin or Manager with a challenge `{ status: "mfa_required" | "mfa_setup_required", challengeToken, expiresInSeconds }` and no tokens. `POST /auth/mfa/verify` takes `{ challengeToken, code }` (a 6-digit authenticator code, or a recovery code typed with or without hyphens and spaces) and returns the usual tokens, plus `recoveryCodesRemaining` when a recovery code was used. A challenge lasts 5 minutes, works once, is stored only as a hash, and is destroyed after 5 wrong codes. A person is also limited across challenges (`RL_MFA_USER_MAX`, `RL_MFA_WINDOW_SECONDS`). Every failure answers the same generic 401.
- **First sign-in:** `POST /auth/mfa/setup/start` returns the key and an `otpauth://` link once; `POST /auth/mfa/setup/complete` with the first code turns it on, returns tokens and 10 recovery codes (`xxxx-xxxx-xxxx`, shown once, stored as hashes). An abandoned setup enables nothing.
- **Codes:** SHA-1, 6 digits, 30 seconds, one step of drift either way; a step that was already accepted for a person can never be used again, even for another challenge.
- **Signed in:** `GET /me/mfa` (is it required, is it on, how many recovery codes are left). `POST /me/mfa/recovery-codes` with `{ password, code }` replaces the whole set; a wrong password or code answers 400 with the field named (never 401, so the app keeps the session).
- **Lost device (R24):** `POST /staff/users/:id/mfa/reset` with a reason (Admin only; not for yourself) removes the secret and recovery codes and ends that person's sessions. For a locked-out sole Admin the operator runs `pnpm admin:bootstrap -- --email <address> --reset-mfa` (an audited system action). The person enrolls again at next sign-in.
- **Rollout (R23):** the migration ends the sessions of current Admins and Managers once, and assigning the Manager or Admin role ends the person's sessions. Expect staff to be signed out once and asked to set up an authenticator.
- **Secrets:** the TOTP secret is stored encrypted (AES-256-GCM) with `MFA_ENCRYPTION_KEY`, 32 random bytes as base64 (`openssl rand -base64 32`). In production the server refuses to start without a real key (or with the development one); keep it in your secret store and never commit it. There is no key rotation yet: changing the key makes stored secrets unreadable, so reset staff (R24) if it must change. Logs and audit rows hold ids and outcomes only, never codes, secrets, challenge tokens or recovery codes. Audit actions: `mfa.enroll`, `mfa.recovery_used`, `mfa.recovery_regenerate`, `mfa.reset`.

## Course reviews (change `course-reviews-basic`)
- **Release note (R28):** reviews were held back until moderation existed. Moderation is now built (next section); it has been tested here, not by real moderators, so run it with staff first.
- **Who:** only a person with an active entitlement writes (R25). One review per person and course: 1 to 5 stars, optional plain text up to 1,000 characters. Writing again replaces it; sending the same content again changes nothing.
- **Endpoints (signed in; the author always comes from the token):** `GET /me/courses/:courseId/review` (your review or `null`), `PUT /me/courses/:courseId/review` with `{ rating, body }`, `DELETE /me/courses/:courseId/review` (repeating it still answers 200 with `deleted: false`). Without access they answer 403 `ENROLLMENT_REQUIRED`. Writes are limited per person (`RL_REVIEW_USER_MAX`, `RL_REVIEW_WINDOW_SECONDS`).
- **Public:** `GET /courses/:courseId/reviews` (newest first, 10 per page, cursor paging; shows rating, text, dates and the display name or "Student", with `mine` set for the signed-in author; never an email or user id). Draft and unknown courses answer the same 404; owners can still read an unpublished course's reviews.
- **Summary:** `rating: { count, average }` (average to one decimal, `null` with no reviews) on catalog cards and the course detail. It comes from `rating_count` and `rating_sum` on the course row, changed under a lock on that row in the same transaction as every review write, so it always matches the list. A repair query if the two ever drifted: `UPDATE courses c SET rating_count = r.n, rating_sum = r.s FROM (SELECT course_id, count(*) n, sum(rating) s FROM reviews GROUP BY course_id) r WHERE c.id = r.course_id;`.
- **Account deletion** removes the person's reviews and corrects the totals in the same transaction.

## Review moderation (change `reviews-moderation`)
- **Reporting:** `POST /courses/:courseId/reviews/:reviewId/report` with `{ reason, note? }` (signed in, not the author; 20 a day, `RL_REVIEW_REPORT_MAX` and `RL_REVIEW_REPORT_WINDOW_SECONDS`). Reasons: `spam`, `abusive`, `personal_info`, `off_topic`, `other`. One open report per person and review; repeating it answers 200 and changes nothing. A report never hides anything, whatever the number of reports (Q27).
- **Staff (`reviews:moderate`, Admin and Manager by default):** `GET /staff/reviews?tab=reported|hidden|appeals`, `GET /staff/reviews/:id`, `POST /staff/reviews/:id/hide` with `{ reason, note }` (`other` needs a note of 10+ characters), `POST /staff/reviews/:id/restore`, `POST /staff/review-appeals/:id/decide` with `{ decision: uphold|overturn, note }`. Hiding removes the review from public lists and the rating totals; restoring puts it back. No route lets staff change a review's rating or text, and there is no staff delete.
- **Author:** `GET /me/courses/:courseId/review` now carries `moderation` (reason, note, `canAppeal`, appeal state); the author can still edit or delete a hidden review (the totals do not move); `POST /me/courses/:courseId/review/appeal` with `{ message }`, once per hiding (409 otherwise).
- **Appeals:** decided by a moderator other than the one who hid the review; a person who can manage roles (Admin) may decide any. Restoring a review settles its open appeal as overturned.
- **Totals:** `rating_count` and `rating_sum` count visible reviews only; every path that changes them holds the course lock. Repair query: as above, adding `WHERE hidden_at IS NULL` to the reviews subquery.
- **Audit:** `review.report`, `review.hide`, `review.restore`, `review.appeal`, `review.appeal.decide`, with ids, the reason code or decision and the rating; never review text, notes or messages.
- **Rollback:** `down.sql` counts hidden reviews in the totals again before dropping the columns.


## Observability (change `observability-baseline`)
- **Logs:** JSON lines with `requestId` (from a valid `x-request-id` or generated) and `traceId` (from a valid W3C `traceparent` or generated; also returned as `x-trace-id`). Request URLs are logged with query parameter names only (`/staff/users/lookup?email=`), never values. Unexpected errors are logged once as `unhandled error` with `err.type`, `err.code`, `err.errorClass` (`dependency` for database or network failures, `server` otherwise) and stack frames, never the message. Client errors (4xx) are not logged as errors.
- **Error reporting:** every unexpected error goes through `ErrorReporter` (`src/platform/error-reporter.ts`). The only implementation writes the log line; an external error-tracking service is pending decision Q31.
- **Metrics:** `GET /metrics` in Prometheus text: `http_requests_total` and `http_request_duration_seconds` by method, route pattern and status class (unknown paths count as `unmatched`), `app_errors_total` by class, memory, uptime and event-loop delay. Open in development and test; in production it answers 404 unless `METRICS_TOKEN` is set, then needs `Authorization: Bearer <token>`. Values are per instance and reset on restart.
- **Alerts and runbook:** `ops/observability/alerts.rules.json` (JSON, which Prometheus reads as YAML) and `ops/observability/RUNBOOK.md`. Thresholds are starting points; no load test has been run and the rules have not been loaded into a running Prometheus.
- **Not yet:** a tracing SDK (Q30), hosted error tracking (Q31), dashboards, log shipping, background-job metrics (no background jobs exist yet).

## Course categories (change `course-categories`)
- **Public:** `GET /categories` (name order, `courseCount` counts published courses) and `GET /courses?category=<id>`. Course responses carry `categoryId`.
- **Staff (`categories:manage`, Admin and Manager):** `GET /staff/categories` (with `totalCourseCount`), `POST /staff/categories` `{ name }`, `PATCH /staff/categories/:id` `{ expectedVersion, name }`, `DELETE /staff/categories/:id` (409 while any course uses it; repeating it answers `deleted: false`). Names are 2 to 40 characters, unique ignoring case, at most 50 categories (R34).
- **Courses:** `categoryId` on `POST /staff/courses` and `PATCH /staff/courses/:id` (`null` removes it); an unknown id is a field error.

## Course modules (change `course-modules`)
- **Staff (`lesson:upload` for the course):** `POST /staff/courses/:courseId/modules` `{ title }`, `PUT .../modules/order` `{ moduleIds }` (every id once, else 409), `PATCH .../modules/:moduleId` `{ expectedVersion, title }`, `DELETE .../modules/:moduleId` (lessons stay, without a module), `PUT .../lessons/:lessonId/module` `{ moduleId | null }`. `POST .../lessons` accepts `moduleId`. All answer with the full staff list (`items`, `modules`).
- **Order:** lesson `position` is the single reading order; the server renumbers it so lessons are grouped by module order with lessons without a module first (R35). Outline responses include `modules` and each lesson's `moduleId`.
- **Database:** composite FK `lessons (module_id, course_id) -> course_modules (id, course_id)` with `ON DELETE SET NULL (module_id)`, which needs PostgreSQL 15 or later.

## Lesson files (change `lesson-resources`)
- **Upload (staff with `lesson:upload` for the course):** `POST /staff/courses/:courseId/lessons/:lessonId/uploads` `{ fileName, mimeType, size }` answers `{ uploadId, partSize, partCount }`; send each part with `PUT /staff/courses/:courseId/uploads/:uploadId/parts/:n` as `application/octet-stream` (exactly `partSize` bytes, the last one the rest; resending replaces it); then `POST .../uploads/:uploadId/complete` `{ title, downloadable?, replaceResourceId? }`. `DELETE .../uploads/:uploadId` cancels. Up to 50 MB; PDF, PNG, JPEG, WebP, Word (.docx) and plain text, judged by the bytes; 20 files per lesson.
- **Manage:** `GET .../lessons/:lessonId/resources`, `PATCH .../resources/:id` `{ expectedVersion, title?, downloadable? }`, `DELETE .../resources/:id`.
- **Students:** `GET /courses/:courseId/lessons/:lessonId/resources` and `POST .../resources/:id/link` `{ download? }` (same access as the lesson text). The link (`/files/:id?t=...`) works for `FILE_LINK_TTL_SECONDS` (default 300), serves inline unless a download was asked for and allowed, with `no-store`, `nosniff` and a sandboxing CSP.
- **Providers:** `STORAGE_DRIVER=local` (`STORAGE_DIR`, default `.dev-storage`) and `SCANNER=none` are for development and tests; production refuses both (Q32, Q33). A cleanup runs every 15 minutes outside tests.

## Lesson video (change `lesson-video`)
- **Staff (`lesson:upload`):** `POST /staff/courses/:courseId/lessons/:lessonId/video/uploads` `{ fileName, size }` (MP4, up to 1 GB), the same part endpoint as files, then `POST .../uploads/:uploadId/complete-video`; `GET` and `DELETE .../lessons/:lessonId/video`.
- **Viewers:** `GET /courses/:courseId/lessons/:lessonId/video` answers the ready video with a playback link (valid `VIDEO_LINK_TTL_SECONDS`, default 4 h) and, for owners, progress. `PUT /me/courses/:courseId/lessons/:lessonId/video-progress` `{ positionSeconds, watchedDeltaSeconds }`; credited time is capped by elapsed time (2x plus 5 s) and the duration; at `VIDEO_COMPLETION_PERCENT` (default 90) the lesson is completed. Manual completion of a video lesson answers 409 `VIDEO_LESSON`.
- **Provider:** `VIDEO_PROVIDER=test` keeps the MP4 in object storage and serves `/videos/:id/stream?t=...` with HTTP ranges; no transcoding or adaptive streaming. Production refuses it (Q09).

## Payments, test mode (change `payments-foundation`)
- **Buyers:** `POST /me/orders` `{ courseId }` with an `Idempotency-Key` header (8 to 100 letters, digits, `-`, `_`); `GET /me/orders?courseId=&cursor=`; `GET /me/orders/:orderId`.
- **Test provider:** `POST /payments/test/checkouts/:ref/complete` `{ outcome: paid | failed | cancelled }` sends a signed event to the webhook handler. `POST /payments/webhooks/:provider` takes signed events (`x-payment-signature`, HMAC-SHA256 of the event JSON with `PAYMENT_TEST_WEBHOOK_SECRET`) of type paid, failed, cancelled, reversed or dispute_won.
- **Staff (`payments:read_status`):** `GET /staff/orders?status=`.
- **Rules:** one pending checkout per person and course; events applied once under a lock on the order; access only through `entitlements` (source `test_purchase`). `PAYMENT_PROVIDER=test` is refused in production (ADR-0008 pending).

## Live classes (change `live-sessions-schedule`)
- **Staff (`live:schedule`, role or Instructor grant):** `GET/POST /staff/courses/:courseId/live-sessions`, `PATCH .../live-sessions/:sessionId` `{ expectedVersion, title?, description?, startsAt?, durationMinutes?, joinUrl? }`, `POST .../live-sessions/:sessionId/cancel` `{ expectedVersion, reason }`.
- **Owners:** `GET /courses/:courseId/live-sessions` (no links), `GET /me/live-sessions` (upcoming across courses), `POST /me/courses/:courseId/live-sessions/:sessionId/join` answers `{ url, endsAt }` while open, else 409 `LIVE_NOT_OPEN`, `LIVE_ENDED` or `LIVE_CANCELLED`.
- **Provider:** `LIVE_PROVIDER=manual` keeps the meeting link staff paste (https, no credentials). `LIVE_JOIN_OPENS_MINUTES` (default 15) sets when the link opens. Rules are proposals (R38); the hosted provider is Q03.

## Continue learning (change `continue-learning`)
`GET /me/continue-learning` answers `{ item: { courseId, courseTitle, coverTone, completed, total, nextLessonId, nextLessonTitle, lastActivityAt } | null }`: the owned, unfinished course with the latest completion or video progress (else the newest access).

## Announcements (change `announcements`)
- **Staff (`announcements:publish`, Admins and Managers):** `GET /staff/announcements`, `POST /staff/announcements` `{ title, body, courseId?, idempotencyKey }`, `POST /staff/announcements/:id/withdraw` `{ reason }`.
- **Everyone signed in:** `GET /me/announcements?cursor=`, `GET /me/announcements/unread-count`, `PUT /me/announcements/:id/read`. Course announcements reach only people with active access. Plain text; in-app only (Q35).
