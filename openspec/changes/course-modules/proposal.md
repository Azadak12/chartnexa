# Proposal

## Why

Workstream B of the owner's master prompt (2026-11-18) asks for a curriculum hierarchy: course modules, module ordering and lesson assignment. Today a course is one flat list of lessons (R11), which does not scale to long courses.

## What Changes

- **Modules:** a course has up to 50 ordered modules (title 1 to 120 characters). Staff who may author the course's lessons (`lesson:upload`, including Instructors with a grant for that course) add, rename (with a version), reorder (full list) and delete modules. Deleting a module keeps its lessons in the course without a module.
- **Lessons in modules:** a lesson belongs to at most one module of the same course (enforced by a composite foreign key). A lesson can be created into a module or moved into or out of one; it goes to the end of its new group.
- **One reading order:** lesson positions stay the single order used by the reader, progress and Continue. The server renumbers them on every change so lessons are grouped by module order, with lessons without a module first.
- **Outline:** `GET /courses/:courseId/lessons` and the staff list also return the modules and each lesson's `moduleId`.
- **App:** module headings on the course page; on the staff Lessons screen a Modules section (add, rename, move up and down, delete) and a Module picker per lesson; lessons move up and down only within their module.
- **Not included:** nested modules, module descriptions or previews, dragging, lesson types other than text (they come with media).

## Confirmation status

Built under the owner's standing instruction to proceed autonomously (2026-11-18). This extends R11 (flat list) and is recorded as R35.

## Capabilities

### New Capabilities
- `course-modules`, `mobile-course-modules`.

## Impact

- New `course_modules` table, `lessons.module_id` with a composite FK (`ON DELETE SET NULL (module_id)`, needs PostgreSQL 15 or later; CI and docs use 16). New staff endpoints. Outline responses gain fields with defaults, so older clients still parse them.
