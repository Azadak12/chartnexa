# Tasks

## 1. Server

- [x] 1.1 Add the `entitlements` table, partial unique and paging indexes, CHECKs, migration and reviewed `down.sql`; verify `pnpm migrate:roundtrip` passes and tests show the database rejects a second active entitlement, a bad source or status, a short reason, and a revoked row without a revoke time.
- [x] 1.2 Add entitlement schemas to `packages/api-contracts` (grant, revoke, staff list item, my course item, `enrolled` and `onSale` fields); verify unit tests for bounds and that old course responses still parse.
- [x] 1.3 Implement the entitlements service and staff endpoints (grant, revoke, list) with idempotency, eligibility checks, audit in the same transaction, and denied-attempt audit; verify integration tests for every scenario in `course-entitlements`, including simultaneous grants, grant racing revoke, double revoke, ineligible and unknown targets, audit rollback on injected failure, no email in audit or logs, and 401, 403 for signed-out, Student and Instructor callers.
- [x] 1.4 Add `OptionalAuthGuard` and apply it to the public lesson, outline and course detail routes; verify tests for valid, missing, malformed, expired and revoked-session tokens, and that the other public behavior is unchanged.
- [x] 1.5 Make lesson reads honor entitlements (locked bodies for owners, owner access after unpublish) and add `GET /me/courses` and `enrolled` on the course detail; verify tests for owner, non-owner, revoked, unpublished-owner, token issued before grant and before revoke, paging stability, and no cross-user data.
- [x] 1.6 Update the OpenAPI route check in CI; verify it fails when a route is removed.

## 2. App

- [x] 2.1 Build My Courses, the enrolled course page and the lesson reader's lost-access state; verify component tests per scenario in `mobile-my-courses` (loading, empty, error, offline, paging, scroll memory, unpublished label, owner opening a locked lesson, access lost mid-read).
- [x] 2.2 Build the staff Students screen, grant form and revoke dialog; verify component tests for grant, repeat grant, unknown and ineligible email, typed text kept, revoke confirm and cancel, no-access state, retry without duplicate, and accessibility labels and announcements.

## 3. Integration and closing

- [x] 3.1 Add contract tests against the real API: staff grants, student reads a locked lesson and sees the course in My Courses, staff revoke, the same token loses access on its next request, Instructor and Student refused on staff routes.
- [x] 3.2 Run mutation checks on the permission, the entitlement check in lesson reads, the unique index and the optional-auth guard; record results.
- [x] 3.3 Update READMEs and the manual device checklist, record R15 to R17 once the owner answers, and write verification evidence listing what ran and what was not verified on devices.
- [ ] 3.4 Run the full checks and `openspec validate entitlements-core`; after review and merge, archive with `openspec archive`.

## Evidence

- Local run (Node 26, PostgreSQL 16): lint, format, builds, typecheck, secrets scan and migration round trip all exit 0; 267 API tests (27 new in `entitlements.integration`, 4 in `entitlements.database`), 311 app unit tests (29 new), 41 contracts tests and 27 app contract tests against the real API (2 new flows: grant, read with the same token, unpublish, revoke, regrant; and ineligible accounts).
- `pnpm check` itself cannot run in this container (Turbo's binary fails with "Exec format error"), so the same steps ran one by one; CI is the authoritative run.
- Bugs found by the tests and fixed: the lesson outline route was missing the optional-auth decorator (an owner of an unpublished course got 404; caught by the owner test); a grant could fail with a 500 when the revoke of the row that blocked it committed between the insert conflict and the follow-up read (seen once as a flaky failure in a full run, then found by reading the code; the grant now retries, and the race test runs 12 rounds); the audit "no email" assertions compared case-sensitively, so a leak would have passed (found by a mutation check).
- Mutation checks (change made, tests run, change reverted): owner check ignored, any signed-in person treated as owner, status ignored in the access check, revoke leaving access active, eligibility skipped, staff list open to any signed-in person, My Courses including revoked rows, and an email written into the audit row. All now cause failures.
- Not verified (no device or simulator): look and feel, screen readers, keyboard behavior in the grant and revoke forms, large-text layout, and focus return on a phone. Rows were added to the manual checklist in `apps/mobile/README.md`.
- Not covered: a real expired access token on the optional-auth routes (tests use malformed, garbage and revoked-session tokens; expiry is covered by the token service's own unit tests); load and capacity of the extra indexed read on locked lessons (no measurements, so no capacity claim).
