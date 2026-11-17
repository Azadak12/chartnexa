# Proposal

## Why

Accounts and sessions exist, but every account is just "a signed-in user". Courses, uploads, staff tools and payments all need to know who is a Student, Instructor, Manager or Admin and what they may do, enforced on the server (ADR-0005). Doing this next also closes two open items from the baseline: how the first Admin is created (Q14) and how privileged changes are audited. Per-instructor permission grants and the Manager delegation ceiling are deliberately left to the next change (`instructor-permission-delegation`) so this one stays small and testable.

## What Changes

- Add roles: Student (implicit for every active account), and one staff role per user from Instructor, Manager or Admin, assigned and revoked only by an Admin with a required reason.
- Add a central authorization service, `can(actor, permission, resource)`, and a route decorator `@RequirePermission(...)` that answers 403 in the standard error envelope. Permissions come from a typed catalog derived from `docs/02_FEATURES_BY_ROLE.md`; each role has a default permission set. Instructors get none by default (no universal instructor privilege, C06); explicit grants arrive in the next change, and `can()` already accepts a resource so grants plug in without API changes.
- Add safety rules: nobody can change their own role, the last active Admin can never be removed or demoted (even by simultaneous requests), staff roles need an active account with a verified email, and disabled or deleted accounts lose all access.
- Add first-Admin bootstrap: an operator-only command that promotes an existing verified account to Admin when none exists, with an explicit, audited recovery flag if the only Admin is locked out.
- Add an append-only audit trail: every role change and every denied attempt at a privileged operation is recorded with actor, target, reason, before and after, request id and outcome. Records cannot be updated or deleted, even by the application's own database role, and contain no secrets or personal data beyond ids.
- Add endpoints: `GET /me/access`, `GET /staff/users/lookup`, `PUT /staff/users/:id/role` and `POST /staff/users/:id/role/revoke`, `GET /staff/audit-events` (cursor-paginated, filterable).
- Account deletion now also ends any staff role (audited).
- **Not included:** per-instructor permission grants, the delegation ceiling and Manager grant powers (`instructor-permission-delegation`); MFA for staff (`staff-mfa`); course ownership and assignment (course changes); any UI.

Assumptions (proposed, changeable before apply; need owner approval, see Q06):
- Only Admins assign or revoke roles. Managers cannot create staff.
- Default Manager permissions: users lookup, course create/update/publish, lesson upload, live scheduling, students and enrollments, operational reports, payment *status* (not full financial data), review moderation, and managing instructor permissions within a ceiling set later. Managers do not get role management, audit reading, platform settings or full payment data. This resolves contradiction X05.
- Audit reading is Admin-only in this change.
- Retention and legal-erasure rules for audit rows are undecided; rows hold only user ids and role or permission names.

## Capabilities

### New Capabilities
- `roles-and-assignments`: the role model, who may assign or revoke roles, the safety rules, and first-Admin bootstrap and recovery.
- `authorization-enforcement`: the permission catalog, role defaults, the server-side check on protected routes, 403 behavior, and reading one's own access.
- `audit-trail`: what is recorded for privileged actions and denied attempts, immutability, and how staff read it.

### Modified Capabilities
<!-- None. account-lifecycle's deletion behavior gains a role-ending side effect, described in the new specs; the existing requirements are unchanged. -->

## Impact

- New: `user_roles` and `audit_events` tables with migrations and tested `down.sql`; a database trigger forbidding updates and deletes on audit rows; authorization and audit services in `apps/api`; role and audit endpoints; a bootstrap command; shared schemas in `packages/api-contracts`.
- Changes: account deletion ends staff roles; OpenAPI gains the new routes and 403 responses.
- No new third-party dependencies expected.
- Docs: ADR-0005 note, decision register (Q06 proposed defaults, Q14 resolved by the bootstrap design), API README.
- Out of scope: grants, delegation, MFA, UI, retention policy.
