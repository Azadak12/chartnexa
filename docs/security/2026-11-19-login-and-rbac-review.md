# Login security and role-based access review (addendum), 2026-11-19

Follows `2026-11-19-security-review.md`. **Scope:** sign-in, sessions, roles and permissions for Admin, Manager, Instructor, Lecturer and Student, on the server and in the app. An internal review with attack tests, not a penetration test; nothing was tested against a deployed system.

## How access works today
- **Identity:** an access token holds only the user id and session id (no role or permission). On every request the server checks the session (not revoked or expired, user active) and then reads the person's role and grants from the database, so removing a role, ending a session or disabling an account takes effect on the next request. Tests prove it.
- **Authorization:** every `/staff` route has `AuthGuard` plus `PermissionGuard` naming a permission. A Student, or anyone lacking the permission, is refused with 403 before anything is looked up, so the answer does not reveal whether an id exists.
- **Roles hold permissions by default** (`PERMISSION_HOLDERS`): Admin and Manager hold the staff permissions; Admin alone holds `roles:manage`, `audit:read` and `payments:read_full`.
- **Instructors and Lecturers** hold nothing by role except what is granted: `course:create` (academy-wide) and course-scoped permissions (`course:update`, `lesson:upload`, `live:schedule`, `assignments:manage`, `students:read`, `reports:read`, `course:publish`), each tied to a specific course. A course-scoped permission cannot be granted without a course (schema and database check). Creating a course gives its creator the six non-publish permissions on that course only.
- **Granting:** Admin may grant anything grantable; a Manager may grant everything except `course:publish`; nobody may change their own grants; every grant and revocation needs a written reason and is audited; last-Admin protection exists.
- **Two-step sign-in** for Admin and Manager is required. The development shortcut (`MFA_DEV_BYPASS`) is refused in production and test, and (new) for any database that is not on this computer.
- **The app** hides what a role should not see and its own screens refuse and make no staff requests, but none of that is relied on: the server decides.

## Verified by attack tests (new: `security.authorization.integration.test.ts`, 26 tests, plus mobile `route-access.test.tsx`)
- Every route that needs sign-in answers 401 to a signed-out caller (80+ routes).
- Every `/staff` route answers 403 to a Student (50+ routes), with the real seeded accounts.
- For every permission-guarded route, each of Student, Instructor, Lecturer, Manager and Admin gets exactly what its permissions say (allowed or 403), and no route answers a server error to any account with empty input.
- The sensitive routes (audit log, instructor list, invitations, user lookup, role assignment, orders, announcements, review moderation, categories, course list) are open only to the roles named for them.
- Forged tokens fail: wrong signature, no signature, another algorithm, expired, one person's id with another's session, and role claims placed inside a token (ignored). Logout and a disabled account end access at once; taking a role away works without a new sign-in; a role field in registration or profile edits is rejected.
- One person's data: another account (or a Lecturer or Manager) cannot read a Student's order or assignment; a new account sees no orders, courses or progress; a Student who does not own a course cannot open its lessons, videos or files or join its live classes.
- A Lecturer using the Lecturer's own course path with ids from a course they were not given gets 404 or 403 for lessons, files, video, modules, uploads and live classes, and the other course's data is unchanged.
- Sessions belong to their owner: lists show only your devices, and ending another person's session answers 404.
- Logs of all of the above contain no password, token or recovery code.
- App: a Student opening 19 staff addresses by hand gets a refusal and no staff request is made; an Instructor is refused at the Admin and Manager screens and at courses they were not given; after sign-out and sign-in as someone else, none of the previous person's data remains.

## Findings and fixes
| ID | Severity | Finding | Fix |
|---|---|---|---|
| L1 | Medium (deployment) | `NODE_ENV` defaults to `development` when unset, which switches off the production safeguards (dev mailer, test payments and the OpenAPI document are allowed). A server started without it would run unprotected. | The server now prints a start-up warning when `NODE_ENV` is unset, when the development shortcut is on, and when a development server uses a remote database. See "Decision needed" below for making production the default. |
| L2 | Medium | The development two-step shortcut was allowed for any database in development mode. | It is now also refused unless the database is on this computer (localhost, loopback or `.local`). Tests: `config.test.ts`. |
| L3 | Low | The course edit screen requested the course before checking access, so a person without access saw a technical error instead of "You do not have access". The server already refused the request. | The screen checks access first, makes no request for someone who may not manage courses, and shows "You do not have access" for a course that is refused or gone. Test: `route-access.test.tsx`. |

No finding allowed anyone to reach another role's data or routes.

## Still true, needs a decision or a deployment
- `TRUST_PROXY` exists and defaults to false. Behind a load balancer, set it correctly, or every client appears to share the balancer's address and the per-address login limit lumps people together.
- Links outlive revocation for their short lifetime (files 5 minutes, video 4 hours) until a hosted video provider (Q09).
- An independent penetration test and a mobile binary review are still required before release.

## Decision needed: making production the default (L1)
Today `NODE_ENV` unset means development. The safer default is production, with development switched on explicitly (`NODE_ENV=development`, which `.env.example` already sets). The cost is that anyone running the server without that variable gets a start-up refusal until they set it. Recommended: yes. Not changed yet because it changes how everyone starts the server.

## Permission management: the structure to discuss (nothing built yet)
The goal you stated: giving one person one permission must never open another person's courses or data. Today that holds because every instructor permission that touches a course names that course. For an Admin screen that grants individual permissions, I propose these rules, and ask you to confirm or change them before I build anything:

1. **Two kinds of grant, never mixed.** Course grants name one course and cover only that course (as now). Academy grants cover no course data (for example creating a course, moderating reviews). A permission that touches course content can never be granted academy-wide.
2. **A grant is never larger than the granter.** Admin can grant any grantable permission; Manager only those below the current ceiling (never publish, never anything the Manager does not hold). Nobody grants to themselves.
3. **Never grantable:** `roles:manage`, `audit:read`, `payments:read_full`, `instructor_permissions:manage` stay with roles. Changing a role is a separate, Admin-only action.
4. **Every grant has a reason, an optional expiry and an audit record**, and revocation takes effect on the next request (already true).
5. **Ownership stays scoped.** Creating a course gives the creator grants on that course only. Sharing a course with a Lecturer is a grant by an Admin or Manager (optionally by the course's owner, if you want delegation) naming that Lecturer and that course.
6. **A person can see what they have.** An "effective permissions" view for the Admin (who can do what, on which courses) and for each person ("my access"), so no grant is invisible.

Questions for you:
- Which permissions should an Admin be able to grant to an individual beyond today's eight (for example, give one Instructor review moderation)?
- Should a Manager be able to grant at all, and may a course's owner share it with another Instructor?
- Should grants be able to expire (for example for a guest Lecturer for one term)?
- Are the defaults in rule 3 right, with roles changed only by an Admin?
