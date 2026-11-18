# Tasks

## 1. Contracts and data
- [ ] 1.1 Shared zod schemas and types for modules, lessons, reorder, outline in `packages/api-contracts`. Verified by unit tests of valid and invalid input and limits.
- [ ] 1.2 Prisma models, migration with deferrable unique constraints, and `down.sql`. Verified by the existing up/down/up migration test plus a constraint test.

## 2. API
- [ ] 2.1 Curriculum module: create, rename, delete modules and lessons under the course-row lock, audited. Verified by integration tests on real Postgres including limits and cascade.
- [ ] 2.2 Reorder endpoints with full-list check. Verified by tests: happy path, missing, unknown, duplicate ids, two concurrent reorders, concurrent add and delete.
- [ ] 2.3 Version check on edits. Verified by a stale-edit test.
- [ ] 2.4 Authorization on every route. Verified by negative tests: Student, Instructor without grant, signed out, wrong course id, denial audited.
- [ ] 2.5 Publish rule, and refusal to delete the last lesson of a published course. Verified by tests including a concurrent delete versus publish race.
- [ ] 2.6 Public outline on course detail, draft hidden. Verified by tests that no description or draft data leaks and response size stays bounded.
- [ ] 2.7 OpenAPI export updated. Verified by the existing export check.

## 3. App
- [ ] 3.1 API client and state for the outline. Verified by contract tests against the real server.
- [ ] 3.2 Student outline on the course page, with states. Verified by component tests incl. large text and screen-reader labels.
- [ ] 3.3 Staff Curriculum screen with sheets, move up/down, confirmations, 403/409/offline/empty/error states. Verified by component tests and a staff contract flow.
- [ ] 3.4 Back-stack and focus return. Verified by navigation tests.

## 4. Verification and docs
- [ ] 4.1 `pnpm check` green locally on Node 26 with Postgres, and in CI. Evidence recorded here.
- [ ] 4.2 Update `docs/10_DECISION_REGISTER.md` with the limits and publish rule as Proposed; update READMEs.
- [ ] 4.3 Owner review of the assumptions, then archive.
