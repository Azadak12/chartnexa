# Design

## Data
- `live_sessions`: course, title (3-120), description (up to 2000), `starts_at` (timestamptz, an instant), `duration_minutes` (15-480), provider (`manual`), `join_url` (https), status `scheduled | cancelled` with reason and time required together, `version` for optimistic concurrency. Course deletion cascades.
- `live_attendance`: first time each person asked for the link (primary key session and user). It is a fact for staff counts, not an attendance rule.

## States
Computed, never stored: `cancelled`; `ended` from start plus duration; `live` from start; `open` from `LIVE_JOIN_OPENS_MINUTES` before; otherwise `upcoming`. The server clock decides; the app refreshes the schedule every minute and on any refused join.

## Concurrency
- Scheduling locks the course row, so the limit of 100 upcoming classes per course is counted exactly.
- Changes and cancels lock the session row and compare `expectedVersion`; the loser of a race gets 409 and the app keeps what was typed and takes the new version.
- Cancelling an already cancelled class answers the class unchanged (no second audit event).
- Joining inserts attendance with `ON CONFLICT DO NOTHING`.

## Rules (R38, proposals pending owner confirmation)
- A class starts in the future (up to 366 days ahead). Once started, its start cannot move; its link, title, description and length can change as long as it still ends in the future. Ended and cancelled classes are final.
- Owners (active entitlement) see a course's classes that have not ended or ended in the last 14 days, without links. The link is given only while `open` or `live`.
- The audit log records ids, titles, times and lengths; never the link (anyone with it could enter) or the description text.

## Provider boundary
`LiveProvider.acceptLink` (the manual adapter refuses links that are not https or that carry a user name or password) and `joinLinkFor` (per-person links for a hosted provider later). `LIVE_PROVIDER` accepts only `manual`.

## App
- Times are entered as a local date (year-month-day) and 24-hour time and sent as an instant; the form states the device's time zone. Impossible dates are refused before sending.
- Scheduling and editing are full screens; cancelling is a sheet with the reason students will see.
