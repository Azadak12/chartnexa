# Proposal

## Why

Workstream B of the owner's master prompt (2026-11-18) asks for course categories and category assignment. Students can only search by title and level today; categories let them browse by topic, and staff need a way to organize courses.

## What Changes

- **Categories** (academy-wide): name 2 to 40 characters, unique ignoring case, at most 50. Admins and Managers (new permission `categories:manage`) add, rename (with the version they started from) and delete them. A category with any course, draft or published, cannot be deleted (409 naming the count). Every change is audited.
- **Course category:** a course has at most one category, set on create or edit (`categoryId`, `null` removes it). An unknown category is a field error. Course responses carry `categoryId`; names come from `GET /categories`.
- **Catalog:** `GET /categories` (public, name order, counting published courses) and `GET /courses?category=<id>`.
- **App:** topic chips on Home (only topics with published courses), a category picker in the course form, and a Categories screen from Manage courses (add, rename, delete with confirmation).
- **Not included:** nested categories, several categories per course, category images or ordering by hand, Instructor-managed categories.

## Confirmation status

Built under the owner's standing instruction to proceed autonomously with routine decisions (2026-11-18). The rules above (limits, who manages categories, refusing to delete a used category) are recorded as R34 and can be changed by the owner.

## Capabilities

### New Capabilities
- `course-categories`: categories, assignment and the catalog filter.
- `mobile-course-categories`: the topic filter, the picker and the staff screen.

## Impact

- New `categories` table, `courses.category_id` (migration with `down.sql`), permission `categories:manage` (Admin and Manager), new endpoints, app screens. No new dependencies.
