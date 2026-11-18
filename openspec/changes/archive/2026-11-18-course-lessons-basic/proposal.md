# Proposal

## Why

Courses exist but have nothing inside them. Staff cannot describe what a course teaches lesson by lesson, and students cannot see a curriculum or try a sample. Lessons are the base that video, files, progress and purchase attach to later, so they must be correct (ordering, permissions, concurrency) before richer media arrives.

## What Changes

- Add **text lessons** on the server: each belongs to one course and has a title, a plain-text body, a position, and a "free preview" flag. A course's lessons are one flat ordered list.
- Staff with lesson authoring rights on a course can add, edit, reorder and delete its lessons. Admins and Managers hold the right by default; Instructors need a per-course grant (from `instructor-permission-delegation`). Every change is audited.
- Concurrent edits are safe: editing a lesson uses its version (stale edit refused); adding, deleting and reordering are serialized per course so two people never produce duplicate or gapped positions.
- Public reading: anyone can see the **outline** (titles, order, preview flag) of a published course. Only lessons marked free preview return their body. Other bodies are refused by the server until entitlements exist (a later change).
- App, students: the course page shows the lesson outline; a preview lesson opens in a full-screen reader; a locked lesson opens a small sheet saying enrollment is coming.
- App, staff: Manage courses, then a course, then Lessons: list, add, edit, reorder (up/down buttons, not drag-only), delete after confirmation.
- Verify against the real server with contract tests, including a staff flow and an Instructor-with-grant flow.

**Not included:** modules or sections, video, audio, files and downloads, rich text or Markdown, images, progress and completion (Q07), entitlements and owned-course access, quizzes, live classes, lesson comments, drafts of individual lessons, soft delete or restore, and any change to course publishing rules.

## Confirmation status

- Confirmed (docs/02, docs/03): courses contain structured lessons; staff build and order lessons "only where permitted"; students can preview eligible lessons.
- Proposed here, needs owner approval: flat list instead of modules; plain text only; hard delete; limit of 200 lessons per course; body limit 20,000 characters; which lessons count as "eligible" for preview (an explicit per-lesson flag set by staff); edits to a published course's lessons go live immediately.
- Pending and not decided here: how completion works (Q07, before `player-resources-progress`), download rules (Q04), what students who own a course see (entitlements).

## Dependencies

- `course-catalog-basics` (archived): courses, catalog, staff screens.
- `rbac-core-and-audit` (archived): the `lesson:upload` permission (Admin and Manager defaults). The identifier says "upload" but here it means authoring lessons; no files are uploaded in this change. Renaming it is not proposed.
- `instructor-permission-delegation` (PR 22, not yet merged): per-course Instructor grants of `lesson:upload`. Admin and Manager flows do not depend on it. Instructor scenarios and tests are implemented only after PR 22 is merged; until then the course-scoped check is the same call that already exists for course update.

## Capabilities

### New Capabilities
- `course-lessons`: server rules for authoring, ordering and reading lessons.
- `mobile-course-lessons`: student outline and reader, staff lesson screens.

### Modified Capabilities
- `course-catalog`: the public course detail links to a public lesson outline and preview reading.

## Impact

- New: `lessons` table with migration and reviewed `down.sql`, a lessons module in the API, shared lesson schemas, app screens, contract tests.
- No new third-party dependencies expected. No secrets.
- Changes the app's `/course/[id]` page (adds the outline) and adds `/course/[id]/lesson/[lessonId]` and `/manage/courses/[id]/lessons` routes.
