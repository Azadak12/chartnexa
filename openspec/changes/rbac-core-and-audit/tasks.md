# Tasks

## 1. Decisions and catalog

- [x] 1.1 Record in `docs/10_DECISION_REGISTER.md` the proposed Manager default permission set (needs owner approval, Q06), the bootstrap design (Q14) and the Admin-only role and audit rules, and add an implementation note to ADR-0005; verify the register labels them Proposed.
- [x] 1.2 Add the permission catalog and role-default map in `modules/access/authorization/permissions.ts`; verify unit tests that Admin holds every permission, Manager excludes `roles:manage`, `audit:read` and `payments:read_full`, Instructor and Student hold none, and that adding a catalog entry without a decision for every role fails a test.

## 2. Data model

- [x] 2.1 Add Prisma models and a migration with `down.sql` for `user_roles` (partial unique index on one active role per user, raw SQL) and `audit_events` with update, delete and truncate blocking triggers; verify `pnpm migrate:roundtrip` passes with three migrations and a test shows a second active role for one user is rejected by the database.
- [x] 2.2 Add shared Zod schemas and types for role, audit and access payloads to `packages/api-contracts`; verify unit tests for valid and invalid payloads including the 3-200 character reason bounds.

## 3. Audit

- [x] 3.1 Implement `AuditService` (`record` within a transaction, `recordDenied`, paginated query); verify integration tests for a record written with a change, no record when the change rolls back, and that records contain no email, password, token or hash.
- [x] 3.2 Verify immutability: integration tests that UPDATE, DELETE and TRUNCATE on `audit_events` through the application connection all fail with the trigger error and leave rows intact.
- [x] 3.3 Implement `GET /staff/audit-events` with cursor pagination and filters; verify tests for newest-first order, each filter, stable paging with inserts between pages, a tampered cursor returning 400, invalid filter values returning 400, and non-Admin 403 plus a denied audit record.

## 4. Authorization enforcement

- [x] 4.1 Implement `AuthorizationService` (`can`, `require`, per-request cache) and the `@RequirePermission` guard with resource option; verify tests for allow, 403 envelope with code FORBIDDEN, 401 when unauthenticated, empty access for disabled and deleted users, and one database read for several checks in a request.
- [x] 4.2 Add `authz.denied` logging and the `@AuditDenied` hook; verify a test that a denied role-management call writes a denied audit record while a denied call on an unannotated route only logs.
- [x] 4.3 Implement `GET /me/access` and `GET /staff/users/lookup`; verify tests that access lists only the caller's own roles and permissions, lookup works for exact email only, returns only id, display name, role and status, denies Instructors and Students, and cannot be used with fragments to browse users.

## 5. Role management

- [x] 5.1 Implement `RolesService` assignment and replacement in one transaction with eligibility checks, self-change rejection and `authz_version` bump; verify tests for Admin assigning Instructor, promotion producing one audit record with before and after, non-Admin 403 with a denied record, missing reason 400, disabled, deleted, unknown and unverified targets rejected, and self-change rejected.
- [x] 5.2 Implement revoke and the last-Admin protection with ordered row locks; verify tests for revoking the only Admin rejected, and two Admins demoting each other simultaneously leaving at least one active Admin (repeat the race many times).
- [x] 5.3 Implement `PUT /staff/users/:id/role` and `POST /staff/users/:id/role/revoke`; verify end-to-end tests including that a revoked Manager's existing access token is denied on the next request and that requests for malformed ids return 400.
- [x] 5.4 Add the account-deletion hook registry to identity and the access hook; verify tests that an Instructor deleting their account loses the role with an audit record, the last Admin's deletion is rejected with 409 and nothing changes, and existing deletion tests still pass.

## 6. Bootstrap

- [x] 6.1 Implement the `admin:bootstrap` command and its service method; verify tests for first Admin created with a system audit record, refusal when an Admin exists, recovery flag marked in the audit record, unknown, disabled and unverified accounts refused, and no secrets printed.

## 7. Verification and docs

- [x] 7.1 Add an end-to-end escalation test (Manager tries to make themselves Admin, to assign roles and to read audit) proving the role is unchanged, each attempt is denied and audited, and logs hold no secrets; extend the OpenAPI check to list the new routes with 403 envelope responses.
- [ ] 7.2 Update `apps/api/README.md` (roles, permissions catalog, bootstrap and recovery runbook, audit immutability and the separate-database-role hardening note) and `.env.example` if needed; verify by following the README in a fresh clone, including bootstrapping an Admin.
- [ ] 7.3 Run the full `pnpm check` and migration round trip from a fresh clone and confirm CI (`check`, `api`, `audit`) is green on the pull request; record the evidence.

## Workflow follow-up

- Review, then archive after verification. Next proposals: `instructor-permission-delegation` (grants, ceiling, Manager powers, escalation tests) and `staff-mfa`.
