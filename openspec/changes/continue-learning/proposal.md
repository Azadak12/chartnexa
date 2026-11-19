# Continue learning on home

## Why
Student learning improvement: returning students should resume where they stopped (journey "Return/resume", docs/03) without opening My Courses and finding the course first.

## What changes
- API `GET /me/continue-learning`: the owned (active access), unfinished course with the latest activity (a completion or video progress; when access began if nothing yet), its progress and next lesson; null when nothing is left.
- App: a "Continue learning" card at the top of home that opens the next lesson; nothing shows while loading, on error, or with nothing to resume.

## Out of scope
Streaks, reminders and recommendations (not approved, docs/11).
