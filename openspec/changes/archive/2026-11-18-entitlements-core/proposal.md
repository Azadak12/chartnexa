# Proposal

## Why

Lessons are locked behind "Enrollment is coming" and My Courses is empty, because nothing records who owns a course. An **entitlement** (ADR-0006, Accepted) is the single record of "this person may learn this course". Purchases will later create entitlements; until then, staff can grant them by hand. Building this first gives the lesson player, My Courses and the payment ledger one tested access rule to attach to, and lets staff try the whole student journey without any payment code.

## What Changes

- Add **entitlements** on the server: one per person and course, with a source (only `admin_grant` exists now), a status (`active` or `revoked`), a reason, who granted or revoked it, and timestamps. A person can hold at most one active entitlement per course.
- Admins and Managers (permission `enrollments:manage`) can grant a course to a student by email and revoke it, always with a reason, both audited. Granting again is harmless; revoking an already revoked entitlement is harmless. Revoked entitlements can be granted again later (new active row; old rows stay as history).
- Students see **My Courses** (their active entitlements, newest first, paged). The course page shows an "Enrolled" state for owners instead of the "enrollment is coming" notice.
- **Lessons open for owners:** an active entitlement lets a student read every lesson of that course; the server decides on every request, reading the database each time (ADR-0006: no cache may grant access). Without one, locked lessons still answer `ENROLLMENT_REQUIRED`. Free previews stay open to everyone.
- App, staff: from Manage courses, a course has "Students" (people with access) with Grant by email and Revoke (reason, confirmation).
- Verify against the real server with contract tests (grant, student reads locked lesson, revoke, access ends on the next request).
- **Not included:** purchases, payment events, orders and the ledger, store billing, progress and completion, lesson files and video, live classes, emailing the student, bulk grants or CSV import, entitlement expiry, reviews, a reports view of students, and any change to course publishing.

## Confirmation status

- Confirmed: access comes from entitlements, lifetime once granted (C10, C15); one active entitlement per user and course and access checks always read the database (ADR-0006, Accepted); Admins and Managers manage enrollments (R03).
- Proposed here, needs owner approval: an Instructor cannot grant or revoke entitlements (no grantable permission covers it); a revoke requires a reason of 3 to 200 characters and can be undone only by granting again; owners keep access when a course is unpublished? (see below).
- Pending and not decided here: what a purchased entitlement looks like (payments change), store or dispute reversals (N01 is agreed but needs real payments), duplicate purchases across channels (Q19).

## Owner decisions (approved in chat 2026-11-18, recorded as R15 to R17)

1. **Unpublished course and owners.** Recommendation: an owner keeps reading lessons of an unpublished course (they own it for life, C15), but it disappears from the public catalog; My Courses still lists it, marked "Not currently on sale". The alternative (hide it from owners) conflicts with lifetime access. This also closes the open question left in `course-catalog-basics`.
2. **Can Instructors see who is enrolled in their course?** Recommendation: not in this change; `students:read` is a separate, later "Students" view.
3. **Who may grant?** Recommendation: Admins and Managers only, as in R03.

## Dependencies

- `rbac-core-and-audit` (archived): `enrollments:manage`, audit. `course-catalog-basics` (archived). `course-lessons-basic` (built, on the review branch; its `ENROLLMENT_REQUIRED` check is where entitlements plug in). This change should start after that branch is merged.

## Capabilities

### New Capabilities
- `course-entitlements`: granting, revoking and checking access, and My Courses on the server.
- `mobile-my-courses`: My Courses, the enrolled course page, and staff grant and revoke screens.

### Modified Capabilities
- `course-lessons`: locked lessons open for owners.

## Impact

- New: `entitlements` table with a partial unique index and `down.sql`, an entitlements module, shared schemas, app screens, contract tests.
- Changes: public lesson reading becomes optional-auth (it must recognize a signed-in owner without requiring sign-in); the course detail response may include `enrolled` for a signed-in caller; the My Courses tab stops being a placeholder.
- No new third-party dependencies expected. No secrets.
