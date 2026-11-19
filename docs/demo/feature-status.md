# Feature status (MVP demo)

"Automated" means tests that ran and passed in this repository (API integration tests against PostgreSQL, app screen tests, and contract tests against the real API). "Device" means checked by a person on a physical phone. **No physical device was available for this work, so every Device cell is "Not verified".**

| ID | Role | Feature | Backend | Mobile UI | Authorization | Automated | Device |
|---|---|---|---|---|---|---|---|
| S01 | Student | Registration, confirm password, email verification | Existing | Confirm-password field added | Existing rate limits, argon2 | Yes (app, API, contract) | Not verified |
| S02 | Student | Sign in, session, profile, sign out, password reset | Existing | Existing | Existing | Yes | Not verified |
| S03 | Student | View courses (thumbnail, instructor, level, category, price, rating, count) | Extended (instructor, category name, thumbnail) | Card redesigned | Public | Yes | Not verified |
| S04 | Student | Search courses, clear, remembered state | Existing | Existing | Public | Yes | Not verified |
| S05 | Student | Explore categories, details, curriculum, instructor | Extended | Detail shows instructor and category | Public | Yes | Not verified |
| S06 | Student | Course demo: preview video and preview lesson | Existing video infrastructure; 6 real MP4 clips seeded | Existing player | Preview vs paid enforced (403 for paid) | Yes (API, seed) | Not verified |
| S07 | Student | Ratings and reviews | Existing | Existing | Owners only write | Yes | Not verified |
| S08 | Student | Simulated purchase | Existing (test provider) | Existing, labelled test mode | Idempotent, owner checks | Yes | Not verified |
| S09 | Student | Progress and resume | Existing | Existing, Continue card | Per-user | Yes | Not verified |
| S+ | Student | Assignments: view, instructions, due date, attachment, submit, status, feedback | New | New tab and screens | Visible only if assigned, published and enrolled | Yes | Not verified |
| I01 | Instructor | Invitation-based access | New (single-use code by email) | Accept screen | Admin and Manager invite; refusals uniform | Yes (API, app, contract) | Not verified |
| I02 | Instructor | Create course (title, description, category, level, price, thumbnail, modules, draft/published) | Existing plus thumbnail | Form plus thumbnail control | Per-course grants; no publish by default | Yes | Not verified |
| I03 | Instructor | Course materials | Existing | Existing | `lesson:upload` per course | Yes | Not verified |
| I04 | Instructor | Video upload, progress, playback | Existing | Existing | `lesson:upload` per course | Yes | Not verified |
| I05 | Instructor | PDF upload | Existing | Existing | `lesson:upload` per course | Yes | Not verified |
| I06 | Instructor | Create assignments (title, instructions, lesson, attachment, due date, draft/published) | New | New screens | `assignments:manage` per course | Yes | Not verified |
| I07 | Instructor | Assign to students, track status, feedback | New | New screens | Only people with active access to the course | Yes | Not verified |
| A01 | Admin | Secure sign-in, MFA, dashboard | Existing | New role dashboard | MFA kept | Yes | Not verified |
| A02 | Admin | Invite instructors; list pending, accepted, expired, revoked; revoke | New | New screen | `instructors:invite` | Yes | Not verified |
| A03 | Admin | Deactivate instructors (confirmed, audited) | New | Reason sheet | Admin only (`roles:manage`) | Yes | Not verified |
| M01 | Manager | Invite instructors, see status, cancel own | New | Same screen | Managers touch only their own invitations | Yes | Not verified |

## Demo-only or simulated
- Purchases are simulated (test payment provider; production refuses it).
- Email is written to files in `apps/api/.dev-mail/` (production refuses the development mailer).
- Videos and files use local disk storage and a test video adapter (no transcoding or adaptive streaming; production refuses them).
- Live class links point to a placeholder (`https://meet.example.com/...`).
- Learners who wrote the sample reviews are fictional and cannot sign in.

## Not built or needing a decision
- Email or push delivery of invitations and announcements (Q35); Instructors posting announcements.
- Assignment submissions are text only (no student file uploads); assigning applies to students enrolled at that moment.
- A hosted video provider, storage provider and malware scanning (Q09, Q32, Q33).
- A web admin workspace (deployment decision pending).
