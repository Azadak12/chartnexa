# Tasks

## 1. Server

- [ ] 1.1 Migration with `down.sql`: `hidden_*` columns and CHECK on `reviews`, `review_reports`, `review_appeals`, indexes and the one-appeal-per-hiding constraint; verify `pnpm migrate:roundtrip` (including with hidden rows) and database-level tests for each constraint and cascade.
- [ ] 1.2 Contracts: reasons, report, hide, restore, appeal, decide, staff queue and detail, `moderation` on the owner's review; verify unit tests for bounds, the `other` note rule and that old responses still parse.
- [ ] 1.3 Reporting: endpoint with the author, visibility, duplicate and rate-limit rules; verify every scenario in `review-moderation`, including hidden and unpublished targets and concurrent duplicate reports.
- [ ] 1.4 Hide and restore with exact totals under the course lock, idempotence and audit; verify scenarios plus races against author edit, author delete and a second moderator, and a randomized recompute test.
- [ ] 1.5 Author side: edit and delete while hidden, the `moderation` state, appeal creation; verify scenarios, including edit not changing totals or visibility.
- [ ] 1.6 Appeals decision with the different-moderator rule and Admin override; verify uphold, overturn, double decide, self-decide refused, Admin allowed.
- [ ] 1.7 Staff queue and detail endpoints with paging and permission checks; verify instructor and Student refusal, role downgrade on the next request, and that reporters appear only to staff.
- [ ] 1.8 Update account deletion, the OpenAPI route check in CI and the audit-leak test; verify no review text, notes or emails in audit rows or logs.

## 2. App

- [ ] 2.1 Report sheet and the author's hidden banner with the Appeal sheet; verify component tests per scenario in `mobile-review-moderation`, including announcements, focus return and double-press protection.
- [ ] 2.2 Staff Reviews screens (queue tabs, detail, hide, restore, decide) gated by permission with all states; verify component tests and that denied access shows a clear message.

## 3. Closing

- [ ] 3.1 Contract tests against the real API (report, hide, public list and totals change, restore, appeal and decide, permission refusals, concurrency); verify they pass.
- [ ] 3.2 Mutation checks on the permission check, totals arithmetic, the hidden-only adjustment, the different-moderator rule, reporter privacy and the audit contents; record results.
- [ ] 3.3 Update READMEs, the device checklist and the decision register (owner answers), lift the R28 release block in the docs, and write evidence including what was not verified on devices.
- [ ] 3.4 Run the full checks and `openspec validate reviews-moderation`; archive with `openspec archive`.
