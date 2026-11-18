# Proposal

## Why

People who own a course have no way to see where they are in it. Lessons look the same on every visit, My Courses cannot say how far along someone is, and there is no "pick up where I left off". The roadmap's `player-resources-progress` change covers this for video and files too; this first slice does it for the text lessons that exist today, and builds the rule (and the data) that video will reuse later.

## What Changes

- Add **lesson completion** on the server. An owner of a course (active entitlement) can mark a lesson complete and mark it not complete again. Both are safe to repeat and safe to send twice at once. Only the person themselves can change or read their own completions.
- Add **course progress**: for each owned course, how many lessons are complete out of how many exist, and the **next lesson** to read (the first incomplete lesson in order, or none when everything is complete).
- App, students: the lesson reader gets a **Mark as complete** button (a switch-style button that also says "Completed" in text, and can be undone). My Courses cards show "3 of 8 lessons complete" with a thin progress bar. The course page shows the same line and a **Continue** button that opens the next lesson (or "Review course" when all are complete).
- Completions follow the rules of access: a revoked owner stops seeing progress and cannot change it; if access is granted again, earlier completions are still there. Deleting a lesson removes its completions; adding a lesson to a course changes the total. Deleting an account deletes the person's completions.
- Verify against the real server with contract tests.
- **Not included:** video and file progress, "watched 90 percent" (arrives with video), XP, streaks, badges or any game mechanic (Q21 pending), certificates (Q08), staff views of student progress (a later `students:read` report), progress for people who do not own the course (free previews are not tracked), progress sync between devices beyond what the server already gives, and a Home "continue" card.

## Confirmation status

- Confirmed: progress and resuming exist in the product (docs/02, docs/03); progress writes must be safe to retry with no duplicate rows (roadmap, S10); access is checked on the server every time (ADR-0006).
- Proposed here, needs owner approval: **Q07 for text lessons is a manual mark**, taken from the proposed default in the decision register ("complete at 90 percent watched; manual mark for non-video lessons"); only owners record progress; unmarking is allowed; the percentage shown is lessons complete divided by lessons in the course right now.
- Pending and not decided: the 90 percent video rule itself is deferred with video; whether staff may see student progress; any reward mechanics.

## Capabilities

### New Capabilities
- `lesson-progress`: recording and reading completions and course progress.
- `mobile-lesson-progress`: marking, showing progress and continuing in the app.

### Modified Capabilities
<!-- None: My Courses and course page behavior are described by the new mobile spec. -->

## Impact

- New: `lesson_completions` table with migration and `down.sql`, a progress module in the API, shared schemas, app changes, contract tests.
- Changes: `GET /me/courses` items gain `progress`; the course detail gains `progress` and `nextLessonId` for signed-in owners; account deletion also removes completions.
- No new dependencies. No secrets.
