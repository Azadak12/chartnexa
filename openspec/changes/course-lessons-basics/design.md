# Design

## Context

- Built: courses (`courses` table, optimistic `version`, staff and public controllers, audit), the permission catalog where `lesson:upload` is course-scoped, grants (from `instructor-permission-delegation`, PR 22, which this change builds on), the mobile course page, the staff editor with `ConfirmDialog` and `ReasonSheet`-style sheets, and the module-boundary lint rule.
- This change depends on PR 22 being merged first, because the Instructor access to lessons is the `lesson:upload` grant it introduces. Admin and Manager access works without it.
- Not built: enrollment, uploads, modules. Those shape the Non-Goals.

## Goals / Non-Goals

**Goals:** a correct, always-complete ordering; lessons editable by the right people only; a public preview that can never leak locked content; screens that work with screen readers and without drag gestures.

**Non-Goals:** modules, media, progress, enrollment-based access, requiring lessons to publish, rich text, localization, search inside lessons.

## Decisions

### D1. Table
`lessons(id uuid, course_id uuid FK courses ON DELETE RESTRICT, title, body, position int, is_preview bool default false, version int default 1, created_by, created_at, updated_at)`. CHECKs: title length 3 to 120, body length at most 20000, position at least 1, version at least 1. A `UNIQUE (course_id, position) DEFERRABLE INITIALLY DEFERRED` constraint makes a duplicate or gap-causing write fail at commit, and lets a reorder renumber inside one transaction. Index on `(course_id, position)` comes with the unique constraint. Alternatives: fractional positions (avoids renumbering but needs periodic rebalancing and weakens the "1..N" guarantee); linked list (hard to query, easy to corrupt). With at most 200 lessons per course, renumbering is cheap.

### D2. All order changes take the course row lock
Create, delete and reorder run in a transaction that first does `SELECT ... FROM courses WHERE id = $1 FOR UPDATE`, so changes to one course's order are serial. Create appends at `max+1`. Delete removes the row and shifts later positions down by one. Reorder takes `{ lessonIds: [...], }`, loads the course's lesson ids under the lock, requires the same set (same size, no repeats, all members) and writes new positions. A reorder built from an outdated list (a lesson was added or deleted meanwhile) fails the set check and answers 409 so the app reloads. Edit does not need the course lock; it uses a compare-and-swap on `version`, like courses.
Locking the course row also serializes against course edits for a few milliseconds; acceptable at this scale.

### D3. Authorization
Staff routes use `@RequirePermission("lesson:upload", { resource: courseOf })` where the course id is the one in the URL; the lesson id in the URL is always resolved within that course (a lesson of another course answers 404 after the permission check passes, and 403 happens first for people without access, so existence is never revealed to them). No new permission and no new grant shapes: Admin and Manager get it by role, Instructors by the existing per-course grant.

### D4. Public reading cannot leak
Public routes join the lesson to a published course in one query (`WHERE course.status = 'published'`); the body column is selected only when `is_preview` is true, in the service, by a single function `toPublicLesson`, so every public path goes through it. A test asserts that no public response for a locked lesson contains the body text, including list responses and error bodies. A locked lesson answers 403 with code FORBIDDEN and a plain message (not 404, so the app can show "available after enrolling"). A lesson id from another course, or a draft course, answers 404.

### D5. Contracts
`packages/api-contracts/src/lessons.ts`: `createLessonRequest {title, body, isPreview?}`, `updateLessonRequest {title?, body?, isPreview?, expectedVersion}`, `reorderRequest {lessonIds: uuid[] (1..200, unique)}`, `staffLesson`, `publicLessonSummary {id,title,position,isPreview}`, `publicLesson {id,courseId,title,body,position,isPreview}`. Limits are exported constants shared with the app.

### D6. Endpoints
- Public: `GET /courses/:courseId/lessons`, `GET /courses/:courseId/lessons/:lessonId`.
- Staff: `GET /staff/courses/:courseId/lessons`, `POST /staff/courses/:courseId/lessons`, `GET`, `PATCH` and `DELETE /staff/courses/:courseId/lessons/:lessonId`, `PUT /staff/courses/:courseId/lessons/order`.
All with the standard error envelope and OpenAPI; the CI route check list gains them.

### D7. Audit
Actions `lesson.create`, `lesson.update` (changed field names, preview before and after), `lesson.delete` (title and position), `lesson.reorder` (before and after id order). Target type `course`, target id the course id, lesson ids in `before` and `after`. No body text is ever written to audit.

### D8. App
- Course page gets a Lessons section below the description, fetched separately (its own loading and error state with Retry, so a failure does not hide the course). Each row is a button: "Title, Preview" or "Title, Locked".
- Preview lesson: full-screen route `course/[id]/lesson/[lessonId]` (content-rich reading is a full screen, ADR-0010); locked: a `BottomSheet`. Plain `Text` only, no markdown or HTML rendering.
- Staff: `manage/[id]/lessons` (list with Move up / Move down, Add lesson), `manage/[id]/lessons/new` and `manage/[id]/lessons/[lessonId]` (full-screen form: title, content, Preview switch, Save, Delete with `ConfirmDialog`). Reordering uses buttons, not drag, so it works with screen readers and switch access. After a Move, the app sends the whole new order, waits for the server, then refreshes; a 409 reloads with a message.
- Gating by `/me/access`: `canManageLessons(access, courseId)` = role holds `lesson:upload` or a grant for that course (the access response already lists `courseGrants`).

### D9. Threat model
- Unauthorized read of locked content: single `toPublicLesson` path, leak tests (D4).
- IDOR across courses: lesson ids always scoped by the course id in the URL; tested both ways.
- Privilege: Instructor on another course (resource check), update-only grant (no `lesson:upload`) cannot manage lessons (tested).
- Stored XSS: content is text, never rendered as HTML, markdown or links; returned as JSON strings; tested with angle brackets.
- Abuse: size limits (body 20000, 200 lessons, title 120) in the schema and in database CHECKs; staff writes use the existing authenticated rate limits.
- Races: course row lock for order changes, compare-and-swap for edits, deferred unique constraint as the last line.

### D10. Observability
Existing request logs and `authz.denied`; lesson changes are visible in the audit trail. No new metrics.

### D11. Migration and rollback
One additive migration `lessons` with a reviewed `down.sql` (`DROP TABLE lessons`); nothing existing changes. Round-trip test in CI. Rolling back the code leaves an unused table, which is harmless.

## Risks / Trade-offs

- Preview flag is the only student-visible gate until enrollment exists; locked lessons are visible by title only. If the owner wants titles hidden too, change the public list.
- Renumbering on every create or delete writes up to 200 rows; fine at this size, revisit if courses grow far beyond.
- Reorder by Move up or Move down sends the whole list each time, which is simple and safe but chatty; acceptable.
- Plain text only will feel limited for teachers; rich content waits for the asset pipeline and a renderer decision.

## Open Questions

- R11 to R13 need owner approval. If the owner wants video links in version 1, add a URL field with an https allowlist; that changes the schema and the threat model, so it should be a separate decision.
- Should titles of locked lessons be public? Assumed yes (it sells the course); the app and API make it a one-line change.
