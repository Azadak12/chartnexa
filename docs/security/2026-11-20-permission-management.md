# Permission management (decisions Q37 and Q38)

Status: built and covered by automated tests (API integration tests against a real database, and mobile screen tests). **Not verified on a physical phone.**

## What an Admin can do

Profile → **Permission management** (or the **Permissions** tile on the Admin dashboard). Only Admins see it; the server answers 403 to everyone else on every route.

- **Instructors / Managers / Students tabs:** search by name or email, open one person. Lecturers have the Instructor role, so they are in the Instructors tab.
- **A person's page:** each switch says where it comes from: *From role*, *Individual grant*, *Switched off for this person* or *Not given*, with the end date if there is one.
- **Instructors:** switches for Create courses and Write reviews, plus **Courses this person works on**: add a course, then switch Edit, Publish, Lessons/videos/PDFs, Live classes, Assignments and submissions, Enrolled students, Reports for that course only.
- **Managers:** each manager permission can be switched off for one person (and back on). Switching off a permission the role gives is recorded as a switch-off, not by editing the role.
- **Students:** Write course reviews can be switched off. Course access is shown read-only; it is changed on the course (Students and access).
- **End date:** choose 7, 30 or 90 days (or none) before saving; it applies to the individual grants and switch-offs in that save. After the end time the permission stops working by itself.
- **Save:** asks for a reason (3 to 200 characters). All changes in one save apply together or not at all, take effect on the next request, and are written to the audit log with the reason. A stale screen is refused (someone else changed the person) and must be reloaded.
- **Roles tab:** change what every Manager, Instructor or Student gets by default. Instructors can gain *Create courses* by default; course permissions are never a role default.

## What the permission names cover today

| Wanted capability | Permission | Note |
|---|---|---|
| Create courses | `course:create` | Academy-wide individual grant |
| Edit assigned courses | `course:update` | Per course |
| Publish courses | `course:publish` | Per course |
| Lessons, videos and PDFs | `lesson:upload` | One permission covers all three |
| Schedule and start live classes | `live:schedule` | Per course |
| Create assignments, review submissions | `assignments:manage` | One permission covers both |
| View enrolled students | `students:read` | Per course |
| Course reports | `reports:read` | Per course |
| Write reviews | `reviews:write` | New; everyone holds it by default |

Splitting videos from PDFs, or assignments from reviewing, is open question Q39.

## Rules the server enforces

- Admin only (`roles:manage`); Managers and Instructors cannot change anyone's permissions (the old Manager grant ceiling is gone).
- `roles:manage`, `audit:read`, `payments:read_full`, `instructor_permissions:manage`: never switchable, for a person or a role (403, audited; database CHECK constraints as well).
- Course permissions only with an explicit course; never academy-wide; never for Managers or Students.
- No Admin accounts, no self-changes, no inactive accounts.
- Switches never create enrollments, purchases or refunds. A student's review also needs course ownership.
- The directory returns names and emails to Admins only; no password, token or session data.

## Environment (Q37)

`NODE_ENV` has no default. Without it the server prints `NODE_ENV: is required and has no default...` and exits. On your computer: `pnpm --filter @chartnexa/api env:init` creates `apps/api/.env` (with `NODE_ENV=development` and fresh secrets) and never overwrites an existing file; `pnpm dev`, `seed:demo` and `account:update` read it as before. On a server set `NODE_ENV=production`.

## Tests

- `apps/api/test/permission-management.integration.test.ts`: Admin-only on every route, restricted four, expiry, deny, role defaults, student switch, audit rows, all-or-nothing, stale version.
- `apps/api/test/security.authorization.integration.test.ts`: the new routes in the sensitive-route table, and in the all-roles authorization matrix.
- `apps/mobile/__tests__/permission-management.test.tsx`, `route-access.test.tsx`.
