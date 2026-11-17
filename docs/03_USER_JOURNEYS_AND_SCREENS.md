# User journeys, screen inventory and navigation behavior

## Student core journey
Discover academy → Browse/search courses → Course detail with ratings/curriculum → Create account/login if needed → Purchase via **approved compliant** checkout → Backend verifies transaction → Lifetime entitlement recorded → My Courses → Player/live lesson/resources → Return/resume → Review course.

### Proposed student screens / views
S01 Splash/Welcome; S02 Register; S03 Login; S04 Password recovery; S05 Home; S06 Catalog; S07 Course Detail (reviews); S08 Checkout/External transition where legal; S09 Payment state; S10 My Courses; S11 Course Player; S12 Live Sessions (if offered); S13 Resources viewer/download; S14 Write/Edit Review sheet; S15 Progress view/inline; S16 Purchase history; S17 Notifications; S18 Profile/Settings.

### Student scenarios
- Student revisits a paid course: show Continue Learning rather than Buy Now.
- A visitor returns from login: preserve chosen course and route.
- Payment completes while app is closed: verify backend order and restore access on reopen.
- Student opens a review: in-page list or bottom sheet; preserve course page position upon return.
- Video interrupted: retain lesson state; resume with explicit user control where feasible.
- Live class canceled/missed: communicate truthful availability and recording policy, if any.

## Instructor journey
Authorized sign-in → Assigned courses/dashboard → Select course → Edit lessons/resources **only where permitted** → Schedule live class if permitted → Submit/Publish via authorized workflow → Track permitted engagement and reviews.

### Proposed instructor screens
I01 Dashboard, I02 Assigned Courses, I03 Course Editor, I04 Curriculum Builder, I05 Lesson Editor, I06 Upload/Resource Library, I07 Live Sessions, I08 Enrolled Students, I09 Progress, I10 Reviews, I11 Analytics, I12 Profile.

## Manager journey
Login → Operations dashboard → View relevant courses/students/instructors → Assign limited permissions under delegated authority → Handle course/enrollment/live-session/review workflows → Audit outcomes and escalate unauthorized actions to Admin.

### Proposed manager screens
M01 Dashboard, M02 Courses, M03 Instructor Assignment, M04 Instructor Permission Editor, M05 Students, M06 Enrollments, M07 Live Scheduling, M08 Content Review, M09 Reviews, M10 Payment View, M11 Reports, M12 Announcements, M13 Profile.

## Admin journey
Login (strong auth) → Platform dashboard → Define roles/delegation → Manage course lifecycle and integrations → Monitor payments, enrollments, live events, reviews and audits → Incident/exception handling.

### Proposed admin screens
A01 Dashboard, A02 Users, A03 Students, A04 Instructors, A05 Managers, A06 Permissions, A07 Courses, A08 Course Editor, A09 Curriculum, A10 Categories, A11 Resource Library, A12 Live Classes, A13 Enrollments, A14 Transactions, A15 Reviews, A16 Analytics, A17 Announcements, A18 Branding, A19 Integrations, A20 System Settings, A21 Audit Logs, A22 Profile.

## Mandatory UX navigation behavior
- **Bottom sheet or dialog:** brief secondary information, review write/edit, quick filters, confirm/cancel, short contextual previews.
- **Full screen:** course details when content-rich, lesson watching, registration, secure checkout, long editing flows.
- **Drawer/side panel:** especially useful for management context on larger screens; don't force drawer for mobile if cramped.
- Preserve scroll position, active filters, selection, draft edits and intended back destination where reasonable.
- Android hardware back and iOS gestures must dismiss the topmost overlay first, then return to prior context.
- Show explicit loading, empty, partial, offline, retry, validation, success and unauthorized states.
- Confirm destructive actions; protect unsaved forms and duplicate submission; show accessible error explanations.
- Platform-appropriate touch targets, accessible contrast, Dynamic Type/text scaling, keyboard navigation where applicable, VoiceOver/TalkBack.
- Avoid extra navigations for short contextual details; never use a popup when a long task needs a full screen.
