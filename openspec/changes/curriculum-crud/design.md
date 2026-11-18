# Design

## Decisions (all Proposed)
1. **Two tables.** `course_modules(id, course_id, title, description, position, version)` and `course_lessons(id, module_id, course_id, title, description, kind, position, version)`. `course_id` is repeated on lessons so permission checks and counts need no join. Foreign keys cascade on delete. `UNIQUE(course_id, position)` on modules and `UNIQUE(module_id, position)` on lessons, both DEFERRABLE INITIALLY DEFERRED so a reorder can rewrite positions inside one transaction. Raw SQL in the migration for the deferrable constraints (Prisma cannot express them); a `down.sql` is required and tested up/down/up.
2. **Serialization.** Every structure write locks the parent `courses` row (`SELECT ... FOR UPDATE`) first. Add, delete and reorder therefore run one at a time per course; no cross-course contention. Alternative considered: fractional positions (no reorder lock, but rebalancing and ugly ids); rejected as unnecessary at these limits.
3. **Reorder contract.** Client sends the full ordered id list; server compares with the current set under the lock and answers 409 on any mismatch. Chosen over single-item "move to index" because it is idempotent and detects stale views.
4. **Optimistic version** on module and lesson text edits, same message style as courses. Structure changes do not bump the course version.
5. **Permission.** `course:update` with `{courseId}` through the existing authorization service, so course grants from `instructor-permission-delegation` apply without change. Denials are audited like other staff denials.
6. **Publish rule** checked inside the publish transaction with the same course-row lock, so a concurrent last-lesson delete cannot slip through.
7. **Public outline** is a separate query returning ids, titles and kinds only; descriptions stay staff-only until preview rules exist.
8. **API shape.** Nested routes under `/staff/courses/:courseId/modules` and `/lessons`, plus `GET /courses/:id` extended with `outline`. Cursor pagination is not needed (hard limits of 50 and 100); the response is bounded and tested for size.

## Threat model
Broken object-level authorization (module id under wrong course: 404), privilege escalation via grants (covered by the shared check), lost updates (version and lock), resource exhaustion (hard limits, request size cap), information leak of draft outlines (404 not 403 for non-staff), audit tampering (existing append-only trail).

## UX and accessibility
Sheets for add and rename; full screen for the curriculum list; reorder by buttons with live-region announcements and 44pt targets; destructive confirmation states counts; focus returns to trigger; no state by colour alone; works at large text. Loading, empty, offline, error, 403 and 409 states defined in the mobile spec.

## Observability
Audit actions: `module.create|update|delete|reorder`, `lesson.create|update|delete|reorder`, with ids, never titles. Request ids flow through existing logging. No PII added.

## Migration and rollback
Additive migration; `down.sql` drops both tables. Existing published courses have no lessons, so the new publish rule would block republishing them; existing published courses stay published, and the rule applies only to future publish actions. This is a deliberate, documented exception.

## Risks
Deferred unique constraints need care with Prisma (raw SQL for reorder). Staff-on-phone authoring of long lists is tedious (known, N05 accepted). The publish rule may surprise staff with existing drafts; message is explicit.
