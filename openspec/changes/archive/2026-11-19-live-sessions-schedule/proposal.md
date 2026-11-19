# Live classes: scheduling, joining and cancelling (provider-neutral)

## Why
Courses may include live classes (C07). The live provider is not chosen (Q03), but scheduling, eligibility, joining and cancellation do not depend on it. This change covers roadmap Phase 6 `live-sessions-schedule`, `live-sessions-join` and `live-sessions-cancel` with a provider boundary and one adapter that keeps a meeting link pasted by staff.

## What changes
- API: `live_sessions` and `live_attendance` tables; staff endpoints to list, schedule, change and cancel (permission `live:schedule`, including Instructor grants); owner endpoints to list a course's classes, list upcoming classes across courses, and get a join link only while the class is open.
- Provider boundary `LiveProvider` with a `manual` adapter (staff paste an https meeting link). Proposed rule R38: the link opens 15 minutes before the start (`LIVE_JOIN_OPENS_MINUTES`) and closes at the end.
- App: "Live classes" on the course page for owners, the next class on home, and staff screens to schedule, edit and cancel (from the course's management screen).

## Out of scope
- A hosted provider (rooms, recordings, attendance from the provider): Q03.
- Reminders and notifications: notifications change.
- Recording policy, attendance rules and refunds for missed classes: owner decisions (Q03).

## Impact
New module `apps/api/src/modules/live`, migration `20261119030000_live_sessions`, contracts `live.ts`, app folder `src/live` and routes under `manage/[id]/live`.
