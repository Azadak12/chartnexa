# Tasks

## 1. Server

- [x] 1.1 Add `lesson_completions` with the composite foreign key, cascade, primary key and index, plus a unique index on `lessons(id, course_id)`, as a migration with reviewed `down.sql`; verify `pnpm migrate:roundtrip` passes and tests show the database rejects a duplicate completion, a completion whose course does not match the lesson's, and an orphan completion, and removes completions with their lesson.
- [x] 1.2 Add progress schemas to `packages/api-contracts` (completion response, progress response, `progress` on my-course items and the course detail); verify unit tests for bounds and that older responses still parse.
- [x] 1.3 Implement the progress service and the three endpoints (mark, unmark, read) with the owner check first, idempotent writes and no personal data in logs; verify integration tests for every scenario in `lesson-progress`, including repeat and simultaneous marks keeping the first time, unmark twice, signed-out, Student without access, revoked owner with the same token, wrong course in the path, deleted lesson, unpublished course, and that one person cannot read or change another's progress.
- [x] 1.4 Compute progress for My Courses and the course detail without per-course queries; verify a test that the query count is the same for 1 and 25 courses, and tests for lessons added, deleted, reordered and an empty course.
- [x] 1.5 Delete completions in the account-deletion transaction; verify tests that only the deleted person's rows go, and that a failing step cancels the deletion.
- [x] 1.6 Update the OpenAPI route check in CI; verify it fails when a route is removed.

## 2. App

- [x] 2.1 Add Mark as complete and Mark as not complete to the lesson reader (all steps and Show all text, owners only) with loading, retry and lost-access states; verify component tests for every scenario in `mobile-lesson-progress`.
- [x] 2.2 Show progress on My Courses cards and the course page, the "Completed" text in the outline, and the Continue and Review course button; verify component tests for each state, text labels and progress roles, and that marking updates both screens.

## 3. Closing

- [x] 3.1 Add contract tests against the real API (owner marks, sees progress and next lesson, unmarks; non-owner refused; revoked token refused; lesson added changes totals); verify they pass.
- [x] 3.2 Run mutation checks on the owner check, the idempotency, the cross-course guard and the next-lesson query; record results.
- [x] 3.3 Update READMEs, the manual device checklist and the decision register (Q07 for text lessons as R18, owners-only as R19) after the owner answers; write evidence listing what ran and what was not verified on devices.
- [ ] 3.4 Run the full checks and `openspec validate lesson-progress-basic`; after review and merge, archive with `openspec archive`.
