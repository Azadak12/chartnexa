# MVP demo readiness

## Why
The owner wants a demo-ready application to show a client on a physical Android phone: four working roles, real thumbnails, five sample courses, instructor invitations, assignments, and a repeatable local setup. An audit showed most student features, authoring, video, files, reviews and simulated purchases already existed; four things were missing.

## What changes
- **Course presentation:** the instructor, category name and a real thumbnail image (validated upload, public cacheable serving) on cards, details and staff forms.
- **Instructor invitations:** `instructors:invite` (Admins, Managers); emailed single-use code; acceptance creates the account or proves ownership of one; list, resend and revoke; Admin-only deactivation that ends role, permissions and sessions and keeps records.
- **Assignments:** `assignments:manage` (course-scoped, grantable); drafts, publishing, attachment, due date, lesson link; assigning to students with active access; student hand-in, feedback, locking; student tab and staff screens.
- **Demo data:** original thumbnails, MP4 previews and PDFs; five complete courses; four role accounts with generated credentials kept in a git-ignored local file; ten fictional reviewers; purchases, progress, assignments, announcement, live class; idempotent, development only.
- **Navigation and registration:** role-aware dashboard tab, renamed tabs, confirm-password on sign-up, an "I have an invitation" entry.

## Out of scope
Email or push delivery (Q35), student file submissions, hosted video or storage providers, a web admin workspace, real payments.
