# Proposal

## Why

The app can sign people in but there is nothing to learn yet. Courses are the core of the product: staff must be able to create and publish them, and students must be able to find and open them. This is the first visible product feature and the base every later feature (lessons, video, purchase, reviews) attaches to.

## What Changes

- Add courses on the server: title, description, level, price in USD (cents), cover tone, and a status of draft or published. Staff with the existing course permissions (Admins and Managers) create, edit, publish and unpublish them; every change is recorded in the audit trail.
- Add a public catalog on the server: anyone can list published courses (search by title, filter by level, newest first, page by page) and open one published course. Drafts are never visible there.
- Protect edits against overwriting each other: an edit that was based on an older version of the course is refused with a clear message.
- App, students: Home becomes the catalog (search, level filter, remembered scroll position) and a course page shows the cover, level, price and description. There is no buy button yet; the page says enrollment is coming.
- App, staff: Profile shows "Manage courses" for people who may create courses. Staff see all courses with their status, create a course, edit it, and publish or unpublish it after a confirmation.
- Verify the app against the real server with contract tests, including a staff flow.
- **Not included:** lessons, modules, video and files, instructors assigned to a course, categories, purchase and payment, enrollment, ratings and reviews, deleting courses, images (the cover is a brand-colored block), and per-instructor permissions (`instructor-permission-delegation`).

Assumptions (proposed, changeable):
- Price is stored in whole US cents, from 0 (free) to $10,000.00; currency is fixed to USD for the launch markets (USA and Canada, decision C13) and real payments stay out of scope (C17).
- Only Admins and Managers can manage courses for now, because Instructors hold no permissions until grants exist.
- The cover is one of three brand tones (blue, black, tint); no arbitrary colors or uploads.
- Unpublishing returns a course to draft; students can no longer see it. Handling of students who already own it is decided with purchases.

## Capabilities

### New Capabilities
- `course-management`: staff creating, editing, publishing and unpublishing courses safely and audibly.
- `course-catalog`: the public list and detail of published courses.
- `mobile-course-browsing`: the student catalog and course page in the app.
- `mobile-course-management`: the staff screens in the app.

### Modified Capabilities
<!-- None -->

## Impact

- New: courses table and migration (with `down.sql`), a courses module in the API, shared course schemas, catalog and course screens, staff screens, contract tests.
- Changes: Home becomes the catalog; the course detail route moves to `/course/[id]` so it opens above the tabs and returns to the same list position.
- No new third-party dependencies expected. No secrets.
- Out of scope: everything listed under "Not included".
