# Tasks

## 1. Server

- [x] 1.1 Add the `reviews` table, rating totals on `courses`, the unique pair and paging index, CHECKs, migration and reviewed `down.sql`; verify `pnpm migrate:roundtrip` and tests that the database rejects a rating outside 1 to 5, over-long text, a second review by the same person for a course, an orphan, totals that are negative or impossible for the count, and removes reviews with nothing left behind.
- [x] 1.2 Add schemas to `packages/api-contracts` (review, write request, page, `rating` on summaries and detail); verify unit tests for bounds, control characters, defaults and that older course responses still parse.
- [x] 1.3 Implement the reviews service and the three signed-in endpoints (read own, upsert, delete) with the owner check first, the course lock, exact totals and rate limiting; verify integration tests for every scenario in `course-reviews`, including simultaneous submits by one person and by ten people, edit then delete then rewrite, double delete, signed-out, Student, revoked owner with the same token, invalid input, a failure injected after the review write rolling both back, totals recomputed from the rows after a randomized sequence of operations, and no text or email in logs.
- [x] 1.4 Implement public listing with paging, reviewer names, unpublished-course rules and the summary on catalog cards and course detail with no extra queries; verify tests for newest first, stable paging while reviews change, name fallback, no email or id in responses, draft and unknown courses answering the same 404, owner reading an unpublished course's reviews, and a query-count check.
- [x] 1.5 Delete the person's reviews and correct totals in the account-deletion transaction; verify tests across several courses, other people's reviews untouched, and a failing hook cancelling the deletion.
- [x] 1.6 Update the OpenAPI route check in CI; verify it fails when a route is removed.

## 2. App

- [x] 2.1 Build `RatingSummary` (cards and course page) and `ReviewsSection` with paging and all states; verify component tests per scenario in `mobile-course-reviews`, including singular and plural text, empty, error with Retry, offline and Show more.
- [x] 2.2 Build the review sheet (stars, text, count, validation), edit and delete with confirmation, retry without duplicates, double-press protection and lost-access handling; verify component tests per scenario, including star labels and announcements.

## 3. Closing

- [x] 3.1 Add contract tests against the real API (owner writes, edits, deletes; summary matches; stranger and revoked owner refused; concurrent submits; paging; privacy); verify they pass.
- [ ] 3.2 Run mutation checks on the owner check, the one-review rule, the totals arithmetic, the course lock, name privacy and the deletion hook; record results.
- [ ] 3.3 Update READMEs, the manual device checklist and the decision register after the owner answers; write evidence listing what ran and what was not verified on devices, and state in the README that reviews must not be released before moderation.
- [ ] 3.4 Run the full checks and `openspec validate course-reviews-basic`; after review and merge, archive with `openspec archive`.
