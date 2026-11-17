# Design

## Context

Existing: NestJS/Fastify API with `modules/identity` (accounts, sessions, `AuthGuard`, `@Authenticated()`, `@CurrentUser()`), `modules/mailer`, `modules/rate-limit`, error envelope with 401/403/429 codes, signed-cursor pagination helper, strict Zod validation, UTC database sessions, tested `down.sql` migrations with a full round trip, structured logs with redaction. Accepted ADR-0005 (central `can()`, authorization as data not token claims, append-only audit with before/after), ADR-0006 (transactions). The users table has `status`, `emailVerifiedAt` and `authzVersion`. Roadmap splits this work: this change is roles, enforcement, bootstrap and audit; grants and the Manager ceiling are `instructor-permission-delegation`.

## Goals / Non-Goals

**Goals:** one place that answers "may this user do this?"; safe role administration; a trustworthy audit trail; a way to create the first Admin.
**Non-Goals:** grants, delegation ceiling, MFA, course ownership, UI, audit retention policy, database role separation (a deployment hardening step noted below).

## Decisions

1. **Module `modules/access`** with `authorization/`, `roles/`, `audit/` and its own controllers; `index.ts` exports `RequirePermission`, `AuthorizationService` and `AuditService`. It imports identity only through identity's `index.js` (`AuthGuard`, `CurrentUser`). Identity must not import access (circular), so account deletion calls a small hook registry exported by identity (`AccountDeletionHooks`); access registers its hook at startup. The hook runs inside the deletion transaction and may veto it (last Admin) or add work (end the role, write audit).
2. **Permission catalog in code** (`permissions.ts`): a typed list of identifiers, each marked global or course-capable. Identifiers follow `docs/02`: `roles:manage`, `audit:read`, `users:read`, `instructor_permissions:manage`, `course:create`, `course:update`, `course:publish`, `lesson:upload`, `live:schedule`, `students:read`, `enrollments:manage`, `reports:read`, `reviews:moderate`, `payments:read_status`, `payments:read_full`. The doc's `...:assigned` suffix is expressed later as a course-scoped grant of the plain permission, not as a separate identifier. Role defaults are a typed map in code (Admin all; Manager operational subset excluding `roles:manage`, `audit:read`, `payments:read_full`; Instructor and Student empty) with a test that fails when a permission is added to the catalog without a decision for each role. Alternative: defaults in a database table; rejected until Admins need to edit role defaults (the ceiling in the next change is the data-driven part, as ADR-0005 says).
3. **`AuthorizationService.can(userId, permission, resource?)`** loads the caller's current status and active role from the database on each request (one indexed query, cached on the request object so several checks cost one read) and returns allow or deny. `require()` throws a 403 envelope. `@RequirePermission(permission, { resource })` composes `@Authenticated()` with a guard; `resource` is a function from the request to `{ courseId? }`. Today only role defaults apply; the next change adds grants as a second source inside `can()` with no API change. Disabled or deleted users yield an empty access set.
4. **Data model:** `user_roles(id, user_id, role, granted_by, reason, created_at, revoked_at, revoked_by, revoke_reason)` with a partial unique index (one active row per user) written in raw SQL in the migration, plus an index on active admins. `audit_events(id, occurred_at, actor_kind, actor_user_id, action, target_type, target_id, outcome, reason, before jsonb, after jsonb, request_id)` with no foreign keys so records survive account deletion. Role history lives in `user_roles` rows (nothing is overwritten).
5. **Immutable audit:** `BEFORE UPDATE OR DELETE` row triggers and a `BEFORE TRUNCATE` statement trigger raise an exception, so the application connection cannot alter history. A test proves update, delete and truncate fail. Triggers do not stop a database owner who drops them; production hardening is to run the application as a separate role with only INSERT and SELECT on `audit_events` and keep migrations on an owner role. That is a deployment task, recorded in the API README and the roadmap's production-validation phase, not claimed here.
6. **Atomic audit:** `AuditService.record(tx, event)` is called inside the same Prisma interactive transaction as the role change. Denied attempts are written outside any change transaction by `AuditService.recordDenied`, because there is no change to commit. Outcomes are `success` or `denied`; a rule rejection (self-change, last Admin) is recorded as `denied` with a machine-readable reason in `after` metadata. The permission guard records a denial for routes annotated with `@AuditDenied(action)` so non-Admins hitting role management or audit reading leave a trace without flooding the table with every 403.
7. **Role assignment rules** live in `RolesService` inside one transaction: reject self-targets; load the target and require `status = active` and verified email; lock all active Admin rows ordered by id (`SELECT ... FOR UPDATE`) when the change involves an Admin, then recount, so two Admins demoting each other concurrently serialize and the second sees one Admin left and is rejected; end the previous active role row and insert the new one; bump the target's `authz_version`; write the audit row. Reasons are 3-200 characters.
8. **Bootstrap command:** `pnpm --filter @chartnexa/api admin:bootstrap -- --email <address> [--recovery]`. It starts a Nest application context (no HTTP), uses the same `RolesService` bootstrap method, runs only where an operator has the database URL (that is the trust boundary), and writes an audit row with `actor_kind = system` and reason `bootstrap` or `recovery`. Without `--recovery` it refuses when any active Admin exists. Exit codes: 0 success, 1 refused or invalid. Output never prints secrets.
9. **Endpoints:** `GET /me/access`; `GET /staff/users/lookup?email=` (needs `users:read`, exact match only, returns id, display name, staff role, status); `PUT /staff/users/:id/role` with `{ role, reason }` and `POST /staff/users/:id/role/revoke` with `{ reason }` (needs `roles:manage`; revoke is a POST so proxies that drop DELETE bodies cannot break it); `GET /staff/audit-events` (needs `audit:read`; cursor on `(occurred_at, id)` descending using the existing signed cursor; filters actor, target, action, outcome, from, to, all validated).
10. **Deletion hook:** deletion first verifies the password (unchanged), then runs one transaction: the hook rejects with a 409 when the caller is the last Admin, otherwise ends the role and writes audit; then the existing erasure steps run in the same transaction.
11. **Logging:** denials emit `authz.denied` with request id, user id, permission and route (no payloads). Audit rows are the durable record; logs are operational.
12. **Contracts and docs:** request and response schemas go in `packages/api-contracts`; ADR-0005 gets an implementation note; the decision register records the proposed Manager default set (needs owner approval, Q06) and the bootstrap design (Q14).

## Risks / Trade-offs

- One database read per authorized request for role lookup -> request-level cache now; measure in capacity tests before adding any cross-request cache with a staleness bound.
- Role defaults in code require a deploy to change -> acceptable until Admins need to edit them; the next change makes grants and the ceiling data-driven.
- Triggers do not stop a database owner -> separate application and migration database roles at deployment; recorded as a hardening task.
- The bootstrap command trusts whoever has database access -> that is the intended boundary; recovery use is always audited and clearly marked.
- Audit growth is unbounded -> retention policy is a recorded open question; no deletion is possible by design, so any future archival must be a deliberate migration.
- Manager defaults are a proposal -> isolated in one typed map with tests, so owner changes are one-line edits.
- Locking active Admin rows could contend under many simultaneous Admin changes -> Admin changes are rare and tiny; the lock set is a handful of rows.

## Migration Plan

Additive: two tables, enum, trigger functions and indexes, each with a reviewed `down.sql` covered by the existing round-trip test (down drops triggers before tables). No existing data changes. Rollback drops the new objects; no other table references them. The first Admin must be bootstrapped after deploy before any staff-only endpoint is usable.

## Open Questions

- Whether Managers should read part of the audit trail (for example for their own actions) can wait; Admin-only is the safe default.
- Audit retention and export policy: pending legal review (Q10).

## Implementation notes (added during apply)

- Revoking is `POST /staff/users/:id/role/revoke` (not DELETE with a body) so proxies that drop DELETE bodies cannot break it.
- Through the HTTP API the "last Admin" rule is reached only by races, because an Admin can only target themselves (rejected as self-change) or another Admin (so at least two exist). It is still enforced in the service, and `revokeRole` also re-checks, inside the transaction, that the acting user is still an Admin, so an Admin demoted a moment earlier cannot finish an in-flight request. Tests prove the re-check by calling the service directly with a non-Admin, and prove the lock by failing when it is removed.
- `--recovery` adds an Admin without removing the locked-out one.
- Bootstrapping an account that is already an Admin succeeds without a change (idempotent) even when other Admins exist.
