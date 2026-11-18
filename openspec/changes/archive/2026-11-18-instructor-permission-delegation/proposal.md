# Proposal

## Why

Instructors are a confirmed role (C04) whose abilities must be controlled one by one by an Admin or an authorized Manager (C06, R04). Today an Instructor can do nothing: the permission catalog and the course code already accept a resource argument, but no grant exists, so Instructors cannot create or edit a course. Courses are the product's core content, so Instructors need a safe way to receive exactly the abilities they are trusted with, and Managers need a limit on what they may hand out. Doing this before lessons, live sessions and reports means those features are built against real grants instead of retrofitted.

## What Changes

**Confirmation status**

- Confirmed: Instructors hold no permissions by default (R04, built); an Admin or authorized Manager controls Instructor permissions individually (C06); every change is audited and enforced on the server (CLAUDE.md).
- Proposed, needs owner approval (recorded as R08 to R10 in the decision register, and they resolve Q06):
  - R08: the grantable permissions and a fixed Manager ceiling (Managers may not grant publishing; Admins may grant any grantable permission). An Admin-editable ceiling is deferred.
  - R09: an Instructor who creates a course automatically receives edit, lesson, live, student and report access on that one course, but not publishing.
  - R10: grants end when the Instructor role ends, the account is disabled or deleted, or the person is changed to another role.

**Build**

- A grants model: a grant is one permission for one Instructor, either for one named course or (for create-course only) for the whole academy, with who granted it, why, and when it ended.
- Server rules: grants and the role defaults combine into the person's effective access on every request; a course permission applies only to the course it was granted for.
- Staff endpoints to list an Instructor's grants and the permissions the caller may grant, to grant (reason required), and to revoke (reason required).
- Instructors who hold a grant can list, open and edit only their own granted courses through the existing course endpoints; publishing needs an explicit publish grant on that course.
- The app: an "Instructor permissions" screen (find a person by email, see their grants, add and remove with a reason), and, for Admins, appointing and removing the Instructor role from the same screen using the existing role API. Instructors with grants see "Manage courses" limited to their courses.
- `GET /me/access` also reports the caller's course grants, informational only.

**Out of scope**

- Lessons, media, live sessions, reports and students lists themselves (the grants for them are recorded now and used when those features exist).
- An Admin-editable ceiling, time-limited grants, grant templates or groups, Manager role changes, MFA for staff.
- Anything about payments, enrollment or refunds.

## Capabilities

### New Capabilities

- `instructor-grants`: how Instructors receive, hold and lose individual permissions, who may grant what, and how grants are listed, audited and enforced.
- `mobile-instructor-permissions`: the app screens for finding an Instructor, managing their grants, and appointing the Instructor role.

### Modified Capabilities

- `authorization-enforcement`: resource-aware checks now honor grants; own access also lists course grants.
- `course-management`: Instructors with grants list, open and edit only the courses they hold grants for; creating a course as an Instructor grants access to it.
- `roles-and-assignments`: ending or changing an Instructor role also ends their grants.
- `mobile-course-management`: "Manage courses" appears for Instructors with grants and shows only their courses.

## Impact

- API: new `instructor_grants` table and migration (with a reviewed `down.sql`), changes to the authorization service and permission guard, new endpoints under `/staff/instructors`, small changes to the courses and roles services, OpenAPI check list.
- Contracts: grant schemas and an extended access response in `packages/api-contracts`.
- Mobile: new staff screens under Profile; Manage courses gating changes; contract tests extended.
- Docs: decision register (R08 to R10, Q06 resolved once approved), README endpoints and the manual device checklist.
- No new dependencies and no secrets.
