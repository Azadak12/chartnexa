# Design

## Context

Existing: `modules/courses` (staff `/staff/courses`, public `/courses`, optimistic `expectedVersion`, audit in the same transaction), `modules/access` (`@RequirePermission`, `lesson:upload` already in the catalog and in Admin and Manager defaults), signed-cursor pagination, strict Zod validation, migration round-trip test, app with Expo Router, `QueryStateView`, remembered scroll hooks, shared Zod schemas, contract tests against the real API. After PR 22 merges: course-scoped Instructor grants and a `resource` option on the permission guard.

## Decisions (proposed)

1. **Module `modules/lessons`**, imports `courses` and `access` only through their indexes. Routes: staff `GET/POST /staff/courses/:courseId/lessons`, `GET/PATCH/DELETE /staff/courses/:courseId/lessons/:lessonId`, `PUT /staff/courses/:courseId/lessons/order`; public `GET /courses/:courseId/lessons`, `GET /courses/:courseId/lessons/:lessonId`.
2. **Data:** `lessons(id uuid, course_id uuid FK ON DELETE CASCADE, title, body, position int, is_preview bool, version int, created_by, created_at, updated_at)`. CHECKs: title length 1 to 120, body length at most 20,000, position at least 1. `UNIQUE (course_id, position) DEFERRABLE INITIALLY DEFERRED` so a reorder can rewrite positions inside one transaction. Idempotency table `lesson_create_keys(course_id, key, lesson_id, created_at)` with unique `(course_id, key)`, rows older than 24 hours purged by the existing cleanup job pattern.
3. **Per-course serialization:** add, delete and reorder start with `SELECT ... FROM courses WHERE id = $1 FOR UPDATE` in the transaction. This is simple and correct at the expected scale (a handful of editors per course); the lock is held only for the transaction, never across requests. Lesson edits use `UPDATE ... WHERE id AND version` with no course lock, since they do not change positions. Alternative: fractional ordering keys; rejected as more complex with no benefit at 200 lessons.
4. **Reorder** takes the full ordered id list. The service loads current ids under the lock; any difference gives 409. Positions are rewritten in one statement.
5. **Delete** is a hard delete with later positions shifted up, in one transaction. No progress or entitlements exist yet. When progress arrives (`player-resources-progress`) it must decide soft delete; recorded as an open question.
6. **Authorization:** staff routes use `@RequirePermission('lesson:upload', { resource: course })` (shape from PR 22). Missing and ungranted courses give the same 403. Public routes call the existing "published course" lookup so drafts give 404 identical to unknown ids. Permission is re-checked inside the write transaction path by the guard on every request, so a removed grant stops the next request.
7. **Public shape:** outline items are `{id, title, position, isPreview}`. The detail endpoint returns the body only when `is_preview` is true; otherwise 403 with code `enrollment_required`. This is the single place the later entitlement check plugs in. Responses carry no `created_by`, `version` or timestamps.
8. **Audit:** `lesson.create`, `lesson.update`, `lesson.delete`, `lesson.reorder` with ids and changed field names only; the body is never written to audit or logs. Request logging already omits bodies; a test asserts it for these routes.
9. **Course detail counts:** `lessonCount` and `previewCount` come from one grouped query on the detail endpoint; the catalog list is unchanged (no per-row count) to keep list queries cheap.
10. **Text safety:** bodies are plain text rendered in a React Native `Text`, so there is no HTML or script interpretation. Control characters other than newline and tab are rejected by validation. No Markdown in this change, so there is no sanitizer to get wrong.
11. **App:** the course page gets a Lessons section from an outline query; the reader is the route `/course/[id]/lesson/[lessonId]` above the tabs. Staff: `/manage/courses/[id]/lessons` (list with move up and down, edit, delete) and a full-screen add or edit form (substantial workflow). Delete uses a dialog; the locked lesson message uses a sheet (lightweight). Move buttons call the reorder endpoint with the new full order and apply optimistic UI that rolls back and announces on 409.

## Threat model (short)

- Reading locked bodies: the server omits them, not the UI. Tested by direct calls.
- Instructor reaching other courses: guard with resource, identical 403, tested.
- Lost update and race on order: version check, course row lock, unique constraint as the last line.
- Body size and abuse: 20,000-character cap, 200 lessons per course, request-size limit, existing rate limits on staff routes.
- Information leaks: draft courses 404 on public routes; audit and logs hold no bodies.

## Observability

Counters for lesson writes by outcome (ok, forbidden, conflict, invalid, limit) and a log line per reorder with ids only. No dashboards in this change.

## Migration and rollback

Additive migration for `lessons` and `lesson_create_keys` with `down.sql`, covered by the round trip. Rollback drops both tables; no existing data changes.

## Risks / Trade-offs

- Course row lock serializes lesson writes within one course: acceptable at this scale; load-test target to be set with Q09 before any capacity claim.
- Hard delete cannot be undone: mitigated by the confirmation dialog; revisit with progress.
- Plain text limits teaching quality: richer content is a separate change after the owner chooses a format.
- Live preview exposure: editing a published course's lesson changes what visitors see immediately; mitigated by staff-only access and audit, revisited with a draft/publish step if the owner wants one.

## Open Questions (owner)

1. Flat lesson list now, modules later: approved? (Proposed: yes.)
2. Should publishing a course require at least one lesson? (Proposed: not in this change, to avoid altering publish rules; revisit in `course-lifecycle`.)
3. Is the per-lesson free-preview flag the right definition of "eligible lessons"? (Proposed: yes.)
4. Hard delete acceptable until progress exists? (Proposed: yes.)
5. Register the answers as R11 to R14 in `docs/10_DECISION_REGISTER.md` after PR 22 merges, to avoid editing the same region concurrently.
