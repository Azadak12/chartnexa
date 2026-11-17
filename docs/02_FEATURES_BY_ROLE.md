# Role-based feature inventory

Legend: **[C]** confirmed business capability; **[P]** proposed implementation feature needing review; **[G]** permission-gated; **[?]** outstanding client choice. A listed screen is not automatically a separate page.

## Student
- [P] Onboarding, account registration/login, password recovery, session management and profile.
- [P] Home, browse/search/filter course catalog, view categories, preview eligible lessons.
- [P] Course detail: description, instructor, structured curriculum, lesson types, one-time price, public rating summary and eligible reviews.
- [C] Pay once for an individual course using the approved compliant purchase flow; [P] show pending/success/failure and restore interrupted checkout.
- [C] Lifetime access to purchased courses; [P] My Courses library, continue learning, resume last lesson.
- [C] Access permitted recorded lectures and join scheduled live lectures where offered; [P] calendar reminders / live-session states.
- [C] View approved lesson resources including images, PDFs, Word and video; **[?]** whether each format is downloadable or view-only; [P] safe file preview.
- [P] Lesson navigation and course progress; completion method to be confirmed.
- [C] Rate/review enrolled course; [P] editable own review, average score, reviews list, sorting/reporting subject to policy.
- [P] View receipts/order history, account settings and essential notifications.
- [P] Quizzes/certificates/assignments and community are not in confirmed scope.

## Instructor
- [C/G] Assigned course participation, with **individual permissions configurable** by Admin/authorized Manager.
- [G] Create courses, edit own/assigned courses, submit for approval, publish/unpublish if authorized.
- [G] Build modules and lessons, upload approved files, manage lesson ordering and descriptions.
- [G] Schedule/host optional live sessions, link recordings and resources.
- [G] See enrolled students, class roster, progress and reviews; respond to reviews where allowed.
- [G] Access own course analytics and teaching activity.
- [P] Profile, notifications and dashboard scoped to assigned courses.
- Never assume Instructor can view payments, global users, grant permissions or manage unrelated courses.

## Manager
- [C] Daily academy operations under Admin oversight.
- [G] Course catalog/curriculum operations, publishing reviews, instructor assignments, live session coordination.
- [G] Manage students, handle enrollment issues, see operational reports and permitted payment statuses.
- [C/G] Configure *specific* instructor capabilities **only within powers delegated to Manager**; prohibit self-escalation.
- [G] Moderate reported reviews with reason and audit trail; cannot rewrite a student's review.
- [P] Dashboard, roster, course calendar, support queues and notifications.
- Manager cannot by default change platform-wide integration secrets, become Admin, bypass purchases or access unrestricted sensitive financial data.

## Admin
- [C] Full platform governance and delegation.
- [P] Manage students, Instructors and Managers; assign/revoke roles and scoped permissions with audit history.
- [P] Courses, modules, lessons, categories, resources and publication workflow.
- [P] Manage enrollments/access, Stripe reconciliation, refunds subject to policy, order reporting.
- [P] Review moderation/appeals, live teaching configuration, announcements, support.
- [P] Brand/theme settings, integrations, platform security/audit, analytics and operational health.

## Role and ownership enforcement
- Backend checks must apply to every protected read/write and file request; mobile/web UI only reflects these rules.
- Permission scopes may include `course:create`, `course:update:assigned`, `lesson:upload:assigned`, `live:schedule:assigned`, `students:read:assigned`, `reports:read:assigned`, `instructor_permissions:manage:delegated` — these are **proposed policy identifiers**.
- Explicitly define Admin vs Manager permission editing, permission delegation ceiling, audit trail, revocation, transfer and course ownership before implementation.
