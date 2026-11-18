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
- [ ] 3.4 Run the full checks and `openspec validate lesson-progress-basic` (done, see Evidence); after review and merge, archive with `openspec archive`.

## Evidence

- Local run (Node 26, PostgreSQL 16): lint, format, builds, typecheck, secrets scan and migration round trip all exit 0; 289 API tests (22 new: 18 progress, 4 database), 356 app unit tests (17 new), 45 contracts tests and 28 app contract tests against the real API (1 new flow: marking, progress and next lesson, a lesson added later, unmark, refusals for strangers and revoked owners, restored marks after a new grant).
- `pnpm check` itself cannot run in this container (Turbo's binary fails with "Exec format error"), so the same steps ran one by one; CI is the authoritative run.
- The database refuses a duplicate completion, a completion whose course is not the lesson's course, and an orphan; completions go with their lesson (database tests).
- Query cost: a test shows `GET /me/courses` uses the same number of queries for 1 course as for 25.
- Mutation checks (change made, tests run, change reverted). Server: owner check skipped on mark, owner check skipped on read, mark overwriting the first time, lesson looked up without its course, next lesson picking the wrong end, counts ignoring the person, next lesson ignoring the person, the course page showing progress to strangers, and the deletion hook not registered. App: completion control shown to non-owners, an empty course showing a bar, Continue never turning into Review course, and the button label never changing. All caused failures. Two server mutations first survived because my edit hit the wrong query and because no test checked the next lesson per person; I fixed the test and redid them. One app mutation (removing the double-press guard) broke the file's syntax and proved nothing, so double-press protection rests on the shared `useSubmitOnce` hook and its end-to-end test.
- Bugs found by the tests: the progress bars were not focusable accessibility elements, so screen readers could skip them (fixed); a leftover unused variable failed lint (fixed).
- Not verified (no device or simulator): screen-reader behavior of the new announcements and progress bars, large-text layout, how the completion button feels with a slow connection, and focus after marking. Rows were added to the manual checklist in `apps/mobile/README.md`.
- Not done by design: video and file progress, rewards, staff views of student progress (R20), progress for non-owners (R19).
