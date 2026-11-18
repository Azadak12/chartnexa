# Tasks

## 1. Server

- [x] 1.1 Migration with `down.sql`: `hidden_*` columns and CHECK on `reviews`, `review_reports`, `review_appeals`, indexes and the one-appeal-per-hiding constraint; verify `pnpm migrate:roundtrip` (including with hidden rows) and database-level tests for each constraint and cascade.
- [x] 1.2 Contracts: reasons, report, hide, restore, appeal, decide, staff queue and detail, `moderation` on the owner's review; verify unit tests for bounds, the `other` note rule and that old responses still parse.
- [x] 1.3 Reporting: endpoint with the author, visibility, duplicate and rate-limit rules; verify every scenario in `review-moderation`, including hidden and unpublished targets and concurrent duplicate reports.
- [x] 1.4 Hide and restore with exact totals under the course lock, idempotence and audit; verify scenarios plus races against author edit, author delete and a second moderator, and a randomized recompute test.
- [x] 1.5 Author side: edit and delete while hidden, the `moderation` state, appeal creation; verify scenarios, including edit not changing totals or visibility.
- [x] 1.6 Appeals decision with the different-moderator rule and Admin override; verify uphold, overturn, double decide, self-decide refused, Admin allowed.
- [x] 1.7 Staff queue and detail endpoints with paging and permission checks; verify instructor and Student refusal, role downgrade on the next request, and that reporters appear only to staff.
- [x] 1.8 Update account deletion, the OpenAPI route check in CI and the audit-leak test; verify no review text, notes or emails in audit rows or logs.

## 2. App

- [x] 2.1 Report sheet and the author's hidden banner with the Appeal sheet; verify component tests per scenario in `mobile-review-moderation`, including announcements, focus return and double-press protection.
- [x] 2.2 Staff Reviews screens (queue tabs, detail, hide, restore, decide) gated by permission with all states; verify component tests and that denied access shows a clear message.

## 3. Closing

- [x] 3.1 Contract tests against the real API (report, hide, public list and totals change, restore, appeal and decide, permission refusals, concurrency); verify they pass.
- [x] 3.2 Mutation checks on the permission check, totals arithmetic, the hidden-only adjustment, the different-moderator rule, reporter privacy and the audit contents; record results.
- [x] 3.3 Update READMEs, the device checklist and the decision register (owner answers), lift the R28 release block in the docs, and write evidence including what was not verified on devices.
- [x] 3.4 Run the full checks and `openspec validate reviews-moderation` (archive follows once CI on `main` is green).

## Evidence

Run locally on the final code, step by step (Turbo does not start in this environment, so `pnpm check` itself was not run):

- `pnpm lint`, `pnpm format`, contract/token/type builds, `pnpm -r typecheck`: pass.
- Tests: 416 API (Vitest, real Postgres; 36 new moderation integration tests and 6 database tests), 420 app (Jest; 18 new moderation tests), 34 contract tests against a real running API (1 new end-to-end moderation flow): all pass.
- `pnpm --filter @chartnexa/api build`, `pnpm --filter @chartnexa/mobile build`, `pnpm secrets`, `pnpm --filter @chartnexa/api migrate:roundtrip`: pass. A database test runs `down.sql` with a hidden review present and checks that the totals count it again.
- Mutation checks (each change made, tests run, file restored), all caught by failing tests: author may report own review; duplicate reports not absorbed; hide leaves totals; restore leaves totals; hide does not settle reports; same moderator may decide own appeal; audit keeps the moderator's note; no conflict guard on appeals; no course lock before moderating; queue lists settled reports (first survived, caught after adding a restore-then-report test); hide open to any signed-in person; editing a hidden review moves totals; deleting a hidden review moves totals; public list shows hidden reviews; account deletion subtracts hidden reviews. One mutation (`ON CONFLICT DO NOTHING` without a target) was equivalent to the original and is not counted.

Not verified: anything on a real iOS or Android device (screen readers, large text, sheet behaviour with the keyboard), real moderators using it, and load or capacity.
