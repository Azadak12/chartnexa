# Tasks

## 1. Server data and rules

- [x] 1.1 Add the courses table, enums, constraints and indexes with a migration and `down.sql`; verify `pnpm migrate:roundtrip` passes and a test shows the database rejects an invalid price or title length.
- [x] 1.2 Add shared course schemas to `packages/api-contracts`; verify unit tests for valid and invalid details, price bounds and the public shape having no staff fields.
- [x] 1.3 Implement the course service (create, update with version check, publish, unpublish, staff list and get, public list and get) with audit in the same transaction; verify integration tests for every scenario in `course-management` and `course-catalog`, including simultaneous edits, incomplete publish, draft hidden, paging with inserts between pages, search with special characters, and level filter.
- [x] 1.4 Add the staff and public controllers with permissions and OpenAPI; verify permission tests (Admin, Manager, Instructor, Student, signed out), error envelope on every failure, and that the OpenAPI check lists the new routes.

## 2. App catalog

- [x] 2.1 Add the app API layer, money formatting and the course card; verify tests for cents to dollars, Free, strict dollar parsing and rejection of more than two decimals.
- [x] 2.2 Build the Home catalog with search, level filter, infinite loading, states and remembered position; verify tests for browsing, search, filter, empty result, error with Retry, and position restored after opening a course.
- [x] 2.3 Build the course page at `/course/[id]` and move the old placeholder route; verify tests for details, enrollment notice, not-found state, and deep link while signed out returning to the course.

## 3. App staff screens

- [x] 3.1 Add the access check and the Manage courses entry; verify tests that Staff see it, Students do not, and the staff route shows access denied to a Student.
- [x] 3.2 Build the staff list with status text and status filter; verify tests for mixed statuses and paging.
- [x] 3.3 Build the create and edit form with price entry, field errors, double-submit protection and stale-edit handling that keeps typed text; verify tests for each scenario.
- [x] 3.4 Build publish and unpublish with confirmation; verify tests for publish, cancel, back, and an incomplete-draft refusal shown beside the field.

## 4. Verification and docs

- [x] 4.1 Extend the contract tests with a staff flow against the real API (create, edit, stale edit, publish, student sees it, unpublish, draft hidden); verify they pass locally and in CI.
- [x] 4.2 Update `apps/mobile/README.md` and the API README (endpoints, permissions, how to make an Admin and publish a first course for a phone test) and the manual device checklist; verify by following them in a fresh clone.
- [ ] 4.3 Run the full `pnpm check` from a fresh clone, confirm CI is green, and record the evidence including what could not be verified on this machine.

## Workflow follow-up

- Review, then archive after verification. Next: lessons and media, `instructor-permission-delegation`, purchase (demo mode).
