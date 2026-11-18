# Proposal

## Why

A course in ChartNexa is only a title, price and description today, so there is nothing to teach or to buy. Lessons are the smallest real content, and buying (demo mode), progress and reviews all depend on them. The permission `lesson:upload` already exists and Instructors can already be granted it per course, so this is the first feature that uses it.

## What Changes

**Confirmation status**

- Confirmed: courses contain lessons in a set order (C-series scope, docs/02); staff with the right permission build them; students can preview eligible lessons before buying (docs/02 [P] preview); enforcement is server-side.
- Proposed, needs owner approval (recorded as R11 to R13 in the decision register):
  - R11: version 1 lessons are flat (no modules) and text only. Modules, video and file uploads come later (`asset-upload-pipeline`, Q04).
  - R12: each lesson has a Preview switch. Preview lessons can be read by anyone on a published course; other lessons show their title with a "locked until you enroll" note until enrollment exists.
  - R13: lesson permissions follow `lesson:upload`: Admins and Managers on every course, Instructors only on courses where they were granted it.

**Build**

- A lessons table: title, plain-text content, position, preview flag, version, per course.
- Staff API (permission `lesson:upload` for that course): list, create, edit (stale-edit protection), delete, and reorder a course's lessons. Reordering sends the full list, so lessons can never go missing or duplicate.
- Public API: a published course's lesson list (titles, order, preview flag) and one lesson (content only for preview lessons).
- App: the course page shows the lesson list and lets anyone open a preview lesson; staff get a Lessons screen from the course editor to add, edit, move up or down, and delete lessons.

**Out of scope**

- Modules or sections, video, images, PDFs, Word files, uploads, downloads, quizzes, progress and completion, live sessions, comments.
- Who may read non-preview lessons (needs enrollment, a later change). Requiring at least one lesson to publish a course (would affect already published courses; deferred).
- Rich text or HTML: content is plain text, shown as text.

## Capabilities

### New Capabilities

- `course-lessons`: creating, ordering, editing, deleting and reading lessons, for staff and for the public preview.
- `mobile-course-lessons`: the lesson list on the course page, the lesson reader, and the staff Lessons screens.

### Modified Capabilities

None. Existing requirements do not change; this adds new behavior beside them.

## Impact

- API: new `lessons` table and migration with a reviewed `down.sql`, a `lessons` module under `modules/courses` boundaries (or its own module), staff and public controllers, audit actions, OpenAPI route check list.
- Contracts: lesson schemas in `packages/api-contracts`.
- Mobile: lesson list on the course page, lesson reader route, staff Lessons routes under Manage courses, contract tests extended.
- Docs: decision register (R11 to R13), READMEs, manual device checklist.
- No new dependencies and no secrets.
