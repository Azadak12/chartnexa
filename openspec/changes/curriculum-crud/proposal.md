# Proposal

## Why

Courses exist but are empty shells. Roadmap Phase 3 puts the curriculum (modules and lessons) next: files, video, progress and the player all attach to lessons, and a course cannot be sold or learned without structure. This change adds only the structure, not the content inside lessons.

## What Changes

- Server: a course has ordered **modules**, and a module has ordered **lessons**. Staff who may update a course can add, rename, delete and reorder modules and lessons. Every change is audited.
- Lesson fields for now: title, short description, and a kind (video, document or live). The kind is a label that later changes (uploads, video, live sessions) will fill with real content. Lessons hold no files yet.
- Ordering is safe under concurrency: two staff reordering at once cannot corrupt or duplicate positions, and a reorder based on an outdated list is refused with a clear message.
- Edits use the same "edited an older version" protection as courses.
- Publishing a course now requires at least one module with at least one lesson (change to `course-management`).
- Students: the public course page shows the outline (module and lesson titles and kinds, with counts). Nothing inside a lesson is exposed. Drafts stay invisible.
- App, staff: a "Curriculum" screen per course to add and edit via sheets and to reorder with explicit move up/down controls (not drag-only, for accessibility), with delete confirmations.
- App, students: the course page shows the outline.
- **Not included:** files, video, text bodies, previews, progress, live scheduling, assigning instructors to courses, categories, lesson moving between modules, bulk import.

Assumptions (proposed, changeable; nothing here is Confirmed):
- Permission is the existing `course:update` on the course, so Admins and Managers now, and Instructors with a course grant once `instructor-permission-delegation` merges.
- Limits: up to 50 modules per course, 100 lessons per module, titles 1 to 120 characters, descriptions up to 500.
- Structure edits are allowed on published courses (typo fixes must be possible). Deleting is allowed too, since no enrollments exist yet; the rule for owned courses is decided with purchases and entitlements.
- Deleting a module deletes its lessons, after a confirmation that states the count.

## Capabilities

### New Capabilities
- `curriculum-management`: staff structure and order a course's modules and lessons safely and audibly, and the public outline.
- `mobile-curriculum`: the staff curriculum screens and the student outline in the app.

### Modified Capabilities
- `course-management`: publishing requires a non-empty curriculum.

## Impact

- New: modules and lessons tables with migration and `down.sql`, a curriculum module in the API, shared schemas, app screens, tests.
- Changes: publish rule on courses; public course detail gains the outline.
- No new dependencies expected. No secrets.
