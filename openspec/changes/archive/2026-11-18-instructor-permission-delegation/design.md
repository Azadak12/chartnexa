# Design

## Context

- Built: roles (`user_roles`, one active staff role per account), a permission catalog with `global` or `course` scope per permission, role-default holders, `AuthorizationService.decide(access, permission, resource?)` (resource accepted but unused), `@RequirePermission(permission, { resource, auditDenied })`, append-only audit, `GET /me/access`, staff user lookup by exact email, and the courses module whose staff routes use `course:create`, `course:update` and `course:publish` with no resource.
- Access is read from the database on every request (once per request via a cache), so revocation is already immediate for roles. Grants must keep that property.
- Instructors and Students hold no permissions by default (R04); decision Q06 asks for a Manager ceiling, no self-escalation and full audit.
- Mobile gates "Manage courses" with the access response; there is a staff stack (`manage/*`) and a ConfirmDialog.

## Goals / Non-Goals

**Goals:** one place decides access (role defaults plus grants); grants are scoped, audited, revocable and immediate; Managers cannot exceed the ceiling; Instructors can start working on courses; the owner can try it all on a phone.

**Non-Goals:** an Admin-editable ceiling, expiring grants, groups or templates, deny rules, course ownership transfer, notification emails to Instructors, and using the lesson, live, students or reports grants (they are stored and reported only).

## Decisions

### D1. One grants table, not columns on roles
`instructor_grants(id, user_id, permission, course_id nullable, granted_by, reason, created_at, revoked_at, revoked_by, revoke_reason, source)` where `source` is `manual` or `owner_auto`. `course_id` references `courses` (restrict). Constraints: `permission` must be in the grantable list (CHECK against a fixed set); `course_id` is null if and only if `permission = 'course:create'` (CHECK). A partial unique index on `(user_id, permission, coalesce(course_id, zero-uuid)) WHERE revoked_at IS NULL` makes a second active identical grant impossible, so concurrent grants collapse to one.
Alternatives: a JSON column on the user (no integrity, hard to audit); a general "roles with permission sets" table (more flexible than C06 needs; revisit if custom roles are requested). History is kept by ending rows, never deleting them.

### D2. Effective access = role defaults plus active grants, computed per request
`access()` also loads active grants for an active Instructor (one extra indexed query, only for Instructors) and returns `grants` beside `permissions`. `decide(access, permission, resource)`:
1. role default holds the permission: allow (applies everywhere);
2. else, a global grant of that permission (only `course:create`): allow;
3. else, a course grant of that permission whose `course_id` equals `resource.courseId`: allow;
4. else deny.
Grants of an account that is not currently an active Instructor are ignored, so a stale row can never act (defense in depth beside D6). Result computed from the database on every request, never from the token.

### D3. Guard changes for unscoped endpoints
Listing has no course id. `@RequirePermission(permission, { anyCourse: true })` allows when the role holds the permission or the caller has any grant of it; the service then filters. The course service receives the caller's access: role holders see all courses; Instructors see `WHERE id IN (granted course ids)` using keyset paging as today. `getForStaff`, `update`, `publish` and `unpublish` pass `resource: { courseId: :id }`. A denied read of a course returns the same 403 whether or not the course exists, so Instructors cannot probe ids.

### D4. Ceiling as a code constant
`GRANTABLE` lists the seven grantable permissions; `MANAGER_CEILING` is that list minus `course:publish`. The granting endpoint checks `access.roles` against the ceiling in the service, not the controller, so every caller path is covered. Resolves Q06 as a proposal (R08). Alternative, an Admin-editable ceiling table, is deferred until the owner asks to change it; the constant is the single place to change.

### D5. Auto-grants when an Instructor creates a course
In the same transaction as course creation, an Instructor with `course:create` receives `course:update`, `lesson:upload`, `live:schedule`, `students:read`, `reports:read` on it, `source = owner_auto`, one audit record per course (not per grant) listing them. Publish is never automatic. Alternative: require a manual grant for every new course, rejected because a created draft nobody can open would be confusing and add support load. Revocable like any grant. Proposal R09.

### D6. Role changes end grants atomically
`RolesService` assign, revoke and delete-account run in a transaction already; ending grants (`UPDATE ... SET revoked_at, revoke_reason='role_ended' WHERE user_id AND revoked_at IS NULL`) joins that transaction, before the role row changes, and the count goes in the same audit record. Proposal R10.

### D7. API surface
- `GET /staff/instructors/:id/permissions` (`instructor_permissions:manage`): `{ userId, displayName, grants[], grantable[{ permission, scope, allowedForYou }] }`; 404 for unknown or non-Instructor.
- `POST /staff/instructors/:id/grants` body `{ permission, courseId?, reason }`: always 200 with `created: true|false`.
- `POST /staff/instructors/:id/grants/:grantId/revoke` body `{ reason }`.
All three use `auditDenied`. Errors use the existing envelope. Contract schemas live in `packages/api-contracts/src/grants.ts`; `accessResponse` gains `courseGrants: [{ courseId, permissions[] }]`, defaulted to `[]` so older apps still parse it.
The grant endpoints live in the `access` module (it owns authorization). Courses already import access, so access reads course id and title directly from the shared database client instead of importing the courses module (no cycle); recorded as a deliberate, read-only exception.
Listing and opening a course for an Instructor depend on the update grant (a publish-only grant does not show the course in the app).

### D8. Concurrency
Grant: insert with `ON CONFLICT DO NOTHING`, then read the winner; revoke: `UPDATE ... WHERE id AND revoked_at IS NULL` and branch on affected rows. Role change versus grant: the grant transaction locks the target's active `user_roles` row `FOR SHARE` and checks Instructor, while role changes take the row `FOR UPDATE`, so a grant cannot land after the role ended. Tested with simultaneous calls.

### D9. App
- Routes under Profile: `profile/instructors` (find by email, result card), `profile/instructors/[id]` (grants list, add sheet, remove confirm, Admin role actions). Sheets for add and remove-with-reason (lightweight), full screen for the person page (substantial). Back returns to the search with the typed email kept.
- Course picker inside the Add sheet reuses the staff course list (paged) with a text filter; permission names in words ("Edit course details", "Publish course", ...), centralised in one map with a test that every grantable permission has a label.
- Gating via `/me/access`: `canManageInstructors` (has `instructor_permissions:manage`); `canManageCourses` also true for create-course or any course grant. Server stays the authority; a 403 anywhere shows "You no longer have access" and refreshes access.
- Reuses `useSubmitOnce`, `FormField`, `ConfirmDialog`, `StateView`; adds a small `ReasonSheet`.

### D10. Threat model
- Privilege escalation: Manager grants publish (blocked by ceiling, tested); Instructor grants to self or others (no manage permission; self-target refused); granting non-grantable permissions (CHECK constraint plus service check); IDOR on course ids (same 403 body; grants checked against the id from the URL, not the body); stale token after revoke (DB read per request); role ended but grant lingers (D2 ignores, D6 ends); duplicate and racing grants (unique index, D8).
- Information disclosure: lookup stays exact-email only; grants list returns no email; audit holds ids and names only.
- Abuse: reasons are length-bounded; endpoints use the existing rate limits for authenticated staff writes.
- Repudiation: every grant, revoke, auto-grant and denial is audited with request id.

### D11. Observability
Log `authz.denied` with the permission (existing), plus `grant.created`, `grant.revoked` counters by permission without ids in metric labels. Audit remains the system of record.

### D12. Migration and rollback
One additive migration `instructor_grants` with a reviewed `down.sql` dropping the table and indexes; no existing table changes, so rollback of code and schema is independent. Existing data is unaffected: no Instructor holds any permission today. Round-trip test runs in CI.

## Risks / Trade-offs

- The fixed Manager ceiling is a guess that needs owner approval; changing it later is one constant but affects who can do what, so it is flagged R08.
- Auto-grants (R09) mean an Instructor with create-course gets broad rights on their own drafts; mitigated by no publish and easy revocation.
- One extra query for Instructors on every request; indexed, measured in a test with a query-count assertion, accepted at this scale.
- Grants for lessons, live, students and reports are recorded before those features exist; risk of the labels promising features not built. Mitigated: the app labels them in words but the Add sheet marks "Coming soon" ones, shown as not yet in use.
- Cross-module wiring (access to courses) may need a port to avoid a cycle; handled in 1.x.

## Open Questions

- R08 to R10 need owner approval before or during review; the plan assumes them. If the owner rejects auto-grants (R09), task 1.5 is removed and the empty-state text changes.
- Should Managers be able to remove an Admin's grant? Assumed yes (revoking only reduces power); revisit if the owner disagrees.
