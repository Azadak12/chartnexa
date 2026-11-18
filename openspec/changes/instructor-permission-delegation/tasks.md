# Tasks

## 1. Server data and rules

- [x] 1.1 Add the `instructor_grants` table, indexes and CHECK constraints with a migration and reviewed `down.sql`; verify `pnpm migrate:roundtrip` passes and tests show the database rejects a non-grantable permission, a course permission without a course, a create-course grant with a course, and a second identical active grant.
- [x] 1.2 Add grant schemas and the extended access response (`courseGrants`, defaulting to empty) to `packages/api-contracts`; verify unit tests for valid and invalid grants (reason bounds, course required or forbidden, unknown permission) and that an old access response still parses.
- [x] 1.3 Teach the authorization service and permission guard about grants (role default, global grant, course grant, ignored when not an active Instructor, `anyCourse` option); verify unit and integration tests for every row of the decision order, grant for another course denied, revoked grant denied with the same token, disabled or role-ended account ignored, and a query-count assertion for Instructors.
- [x] 1.4 Implement the grants service and the three staff endpoints (list with grantable and allowed-for-you flags, grant, revoke) with the Manager ceiling, eligibility checks, self-target refusal, idempotent grant, audit in the same transaction and denied-attempt audit; verify integration tests for every scenario in `instructor-grants`, including Manager publish refused, non-Instructor target, unknown course, repeated and simultaneous identical grants, grant racing a role revoke, double revoke, no email in responses, and 401 and 403 for signed-out, Student and Instructor callers.
- [x] 1.5 Add automatic course grants when an Instructor creates a course (same transaction, no publish, one audit record); verify tests for create-then-edit, create-then-publish refused, and revoking the automatic grant.
- [x] 1.6 Make role revoke, role replacement and account deletion end grants in the same transaction; verify tests for each path, all-or-nothing on failure (injected error), and no grants after reappointment.
- [x] 1.7 Apply grants to the courses controller and service (resource on get, update, publish, unpublish; instructor-filtered paged list; create requires the create grant; identical 403 for missing and ungranted courses); verify tests for an Instructor and a Manager editing the same course (conflict still works), paging with other courses added in between, no leakage of ungranted courses, and the existing Admin and Manager course tests unchanged.
- [x] 1.8 Update the OpenAPI route check in CI for the new routes; verify the check fails when a route is removed and passes with them present.

## 2. App access and course screens

- [x] 2.1 Extend the app's access layer with course grants and the `canManageInstructors` check, and change the Manage courses gate; verify tests for Admin, Manager, Instructor with and without grants, and Student.
- [x] 2.2 Make the staff course list, form and publish controls respect Instructor scope (granted list only, New course only with the create grant, no publish control without the grant, friendly empty state, "no longer have access" handling that keeps typed text); verify tests for each scenario in `mobile-course-management`.

## 3. App permission screens

- [x] 3.1 Add the Profile entry, the find-by-email screen and result states (found Instructor, not an Instructor, not found, invalid, loading, error with Retry); verify tests for each state and that Instructors and Students do not see the entry and get access denied on the route.
- [x] 3.2 Build the person page with the grants list (permission in words, course title, Remove) and the Add sheet (permission, course picker, reason, Manager ceiling shown as unavailable); verify tests for adding, field errors, the Manager ceiling, a label for every grantable permission, and typed text kept after a failed save.
- [x] 3.3 Build remove with confirmation and reason, plus the Admin-only Make Instructor and Remove Instructor actions using the existing role API; verify tests for confirm, cancel, back, double tap sending one request, 403 and 404 handling, and Managers seeing no role action.
- [x] 3.4 Accessibility pass on the new screens (labels, 44-point targets, announced success and errors, focus restored when sheets close, large-text layout); verify with tests of roles, labels and focus return, and list what could not be checked without a device.

## 4. Verification and docs

- [x] 4.1 Extend the contract tests to run a real flow against the API (Admin appoints an Instructor, Manager grants create course, Instructor creates and edits a course, cannot publish, Admin grants publish, Instructor publishes, revoke stops the next edit, Manager cannot grant publish); verify they pass locally and in CI.
- [x] 4.2 Record R08 to R10 and the Q06 resolution in `docs/10_DECISION_REGISTER.md` as proposals awaiting approval, and update the API and app READMEs (endpoints, ceiling, phone walkthrough to appoint and grant an Instructor) and the manual device checklist; verify by following the walkthrough in a fresh clone.
- [ ] 4.3 Run the full `pnpm check` from a fresh clone, confirm CI is green, and write the evidence including what could not be verified on this machine (device look and feel, keyboard, screen readers).

## Evidence

- Local and fresh-clone `pnpm check` exit 0 (8 of 8 tasks). API: 195 tests, 34 of them new (25 over HTTP against a real PostgreSQL covering every scenario in `instructor-grants`, plus 9 for database constraints, the decision order, query count and all-or-nothing role changes). Contracts: 25. Mobile: 246 unit tests (33 new) and 23 contract tests (1 new) that run the app's layers against the real API through the whole flow: appoint, Manager grants create-course, Instructor creates and edits, Manager stopped at the ceiling, Admin grants publish, Instructor publishes, edit grant removed, role removed.
- Mutation checks (change the code, confirm tests fail, restore): removing the role-row lock in grant-ending makes the simultaneous role-change test fail 3 of 3 runs (a grant could survive the role); putting publish inside the Manager ceiling fails 2 tests; making a course grant apply to every course fails 3 tests.
- Found and fixed during the work: a real race (a grant landing while the role was being revoked would have survived the role) by locking the role row before ending grants; mobile tests that forgot to await the async fireEvent calls.
- Design decisions made while building: the grant endpoint always answers 200 with `created: true|false` (not 201); access reads the courses table directly to avoid an import cycle; listing and opening a course for an Instructor depend on the update grant, so a publish-only grant does not show the course.
- Not verified (no device or simulator here): how the Add permission sheet looks and scrolls with the keyboard open, large-text layout, screen readers announcing the success messages, and focus return on a real device. They are on the manual checklist in `apps/mobile/README.md`.
- Proposals R08 to R10 are recorded as awaiting owner approval; nothing here is marked Confirmed.
