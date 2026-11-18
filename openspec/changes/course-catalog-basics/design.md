# Design

## Context

Existing: NestJS API with `modules/access` (`@RequirePermission`, audit service, role defaults with `course:create`, `course:update`, `course:publish` for Admin and Manager), signed-cursor pagination helper, strict Zod validation, UTC database sessions, migration round-trip test. App: Expo Router with a catalog-ready Home placeholder, session manager, `QueryStateView`, remembered scroll hooks, forms with React Hook Form and shared Zod schemas, contract tests against the real API. See proposal.md.

## Decisions

1. **Module `modules/courses`** in the API with a service, a staff controller (`/staff/courses`) and a public controller (`/courses`). It imports the access module only through its index.
2. **Data:** `courses(id uuid, title, description, level enum, price_cents int, cover_tone enum, status enum draft|published, version int, created_by, created_at, updated_at, published_at)`. CHECK constraints (price range, title length) in the migration as a second line of defense. Indexes on `(status, published_at desc, id desc)` for the catalog and `(updated_at desc, id desc)` for staff.
3. **Optimistic concurrency:** `PATCH` carries `expectedVersion`; the update is `UPDATE ... WHERE id = $1 AND version = $2` inside a transaction that also writes the audit row; zero rows means 409. Two simultaneous edits therefore yield exactly one winner without locks held across requests.
4. **Publishing rules** live in the service: a draft must have title, description (non-empty), level and a price (zero allowed). Failures return field errors. Publish and unpublish are separate endpoints so permissions can differ, and both bump the version.
5. **Catalog queries** use keyset pagination on `(published_at, id)` descending with the existing signed cursor; search is `title ILIKE` with `%`, `_` and `\` escaped and the term length-limited; level is an enum filter. Public responses use a dedicated public shape (no `created_by`, `status`, `version`).
6. **404 for drafts** in the public detail so existence of a draft is not revealed.
7. **Audit:** `course.create`, `course.update`, `course.publish`, `course.unpublish` with before and after of the changed fields only, written in the same transaction.
8. **App:** Home uses an infinite query with search (debounced 300 ms) and level chips, `useScreenMemoryState` for filters and `useRestorableScroll` for position. The course page is the route `/course/[id]` above the tabs (replacing the earlier placeholder under My Courses) so returning keeps the list position. Staff routes live under `/manage/courses`, shown from Profile when `GET /me/access` includes `course:create`; the staff screens do not trust that flag for security.
9. **Money:** whole cents everywhere; the app formats with `Intl.NumberFormat` (USD) and parses dollar input with a strict regex into cents, never floating point.
10. **Cover:** three tones mapped to brand tokens; no new colors.
11. **Contract tests** gain a staff flow; the test server's database URL is passed to the test process so a helper can run the existing `admin:bootstrap` command to create an Admin.

## Risks / Trade-offs

- Substring search will not scale to a very large catalog -> acceptable now; revisit with a search index when measured.
- Version conflicts frustrate staff editing the same course -> the message keeps their typed text and offers a reload.
- Moving the course route changes deep links -> nothing shipped depends on the old placeholder path.
- Unpublishing hides a course students may already own -> handled with purchases; recorded as an open question.

## Migration Plan

Additive migration with `down.sql` covered by the round trip. Rollback drops the courses table and enums.

## Open Questions

- Behavior of an unpublished course for students who own it (purchases change).
- Whether categories are needed before lessons.
