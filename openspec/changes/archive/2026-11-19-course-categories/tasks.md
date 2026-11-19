# Tasks

- [x] 1.1 Migration with `down.sql`, schema, permission `categories:manage`; verify the migration round trip.
- [x] 1.2 Contracts for categories and `categoryId` on courses and the catalog query.
- [x] 1.3 Categories service and endpoints with limits, uniqueness, versions, delete protection and audit; course create and update with category checks; catalog filter; verify 11 integration tests including simultaneous creates, the 50 limit under concurrency, rename races and delete against assignment.
- [x] 1.4 App: topic filter, form picker, staff Categories screen; verify 7 component tests.
- [x] 1.5 Contract test against the real API; CI route check.
- [x] 1.6 Mutation checks and full checks; CI on `main` passed; archived.

## Evidence

- Note on process: the proposal and specs were written alongside the implementation under the owner's instruction to work autonomously, not reviewed before it.
- Full local checks (step by step): lint, format, builds, typecheck, 449 API tests (11 new), 427 app tests (7 new), 35 contract tests (1 new), API and app builds, secrets scan, migration round trip: all pass.
- Mutation checks, all caught: delete ignores courses in use; unknown category not checked; catalog ignores the filter; public count includes drafts; create without a permission check; no limit; no lock on creates (limit passed under concurrency); rename ignores the version (both the check and the compare-and-swap removed). Invalid or equivalent mutations: replacing the permission decorator with an unimported one did not compile; removing only the version check is equivalent because the compare-and-swap still refuses.
- Not verified: on devices (chip wrapping at large text, screen reader order).
- CI on `main`: run 77 (`2b397b9`) success.
