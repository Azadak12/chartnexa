# Tasks

## 1. Server data and rules

- [ ] 1.1 Add `lessons` and `lesson_create_keys` with CHECKs, deferrable unique position and cascade, migration and reviewed `down.sql`; verify `pnpm migrate:roundtrip` passes and tests show the database rejects an empty or over-long title, a body over the limit, position 0, a duplicate position committed, and an orphan lesson.
- [ ] 1.2 Add lesson schemas to `packages/api-contracts` (staff lesson, outline item, public lesson, create, update, reorder, error codes incl. `enrollment_required`); verify unit tests for bounds, trimming, control characters, 200-item limit and that unknown fields are rejected.
- [ ] 1.3 Implement the lessons service and staff endpoints with per-course lock, gapless positions, version checks, idempotent create, limit of 200, and audit in the same transaction; verify integration tests for every scenario in `course-lessons`, including simultaneous adds, add racing reorder, stale reorder 409, delete closing the gap, repeated add with one key, audit rollback on injected failure, and no body in audit or logs.
- [ ] 1.4 Apply permissions: Admin and Manager by role default; Student 403, signed-out 401; wrong course in path 404; verify tests for each role and for the identical 403 body for missing and ungranted courses (Instructor cases added after PR 22 merges, see 4.1).
- [ ] 1.5 Implement public outline and lesson endpoints, draft and unpublish giving 404, locked body giving 403 `enrollment_required`, and counts on the course detail; verify tests for outline without bodies, preview body, locked, draft, unpublish-then-404, empty course, and that responses hold no internal fields.
- [ ] 1.6 Update the OpenAPI route check in CI for the new routes; verify the check fails when a route is removed and passes with them present.

## 2. App: students

- [ ] 2.1 Add the Lessons section to the course page and the preview reader route with loading, empty, error-retry, offline, locked sheet and "no longer available" states, preserved scroll; verify component tests per state and per scenario in `mobile-course-lessons`, plus accessibility checks (labels, text-based preview mark, large font).

## 3. App: staff

- [ ] 3.1 Add the staff lessons list with move up and down (optimistic with rollback and announcements), delete dialog, and the full-screen add and edit form with typed-text preservation, field errors and conflict handling; verify component tests for add, edit, validation, conflict, delete confirm and cancel, move, no-access state, and retry without duplicate.

## 4. Integration and closing

- [ ] 4.1 Add contract tests against the real API: staff flow (create course, add, edit, reorder, delete, publish, student outline and preview, locked refusal); after PR 22 merges, add an Instructor-with-grant flow and an ungranted-Instructor refusal and rerun the full suite.
- [ ] 4.2 Run mutation checks on the permission, locked-body and order-lock logic (remove each, confirm a test fails); verify by recording the results.
- [ ] 4.3 Update `apps/mobile/README.md` (lessons now exist; manual device checklist for screen reader, keyboard and font scaling), record R11 to R14 in the decision register once the owner answers, and write verification evidence listing what ran and what was not verified on devices.
- [ ] 4.4 Run `pnpm check` and `openspec validate course-lessons-basic`; after review and merge, archive with `openspec archive`.
