# Design

## Context

Entitlements (`modules/entitlements`, `hasActive`), lessons (`modules/lessons`, positions 1..N), `GET /me/courses`, the course detail with `enrolled`, the lesson reader with steps, account deletion hooks (`AccountDeletionHooks`), and contract tests exist. See ADR-0006 (access reads the database) and the roadmap's S10 (safe retries, no duplicate progress writes).

## Decisions (proposed)

1. **Module `modules/progress`**, importing entitlements and lessons through their indexes. It owns completions; other modules never write to its table.
2. **Data:** `lesson_completions(user_id FK, lesson_id FK ON DELETE CASCADE, course_id FK, completed_at)` with primary key `(user_id, lesson_id)`. Storing `course_id` (checked against the lesson's course by a composite foreign key `(lesson_id, course_id)` to `lessons(id, course_id)`) makes per-course counts one indexed read and prevents a completion pointing at the wrong course. Index `(user_id, course_id)`. No update path: a completion is created or deleted. No separate "version" or event log now; the roadmap's later reward and report work can read this table.
3. **Idempotent writes:** `PUT /me/courses/:courseId/lessons/:lessonId/completion` is `INSERT ... ON CONFLICT DO NOTHING` (the first time is kept) and always answers 200 `{ completed: true, completedAt }`; `DELETE` is `DELETE ... WHERE` and always answers 200 `{ completed: false }`. Both check `hasActive` first and answer 403 with the same body as the lesson routes otherwise; unknown lesson or wrong course is 404 (checked after access so a non-owner learns nothing).
4. **Reads:** `GET /me/courses/:courseId/progress` returns `{ completed, total, nextLessonId, lessons: [{ lessonId, completedAt }] }` (the list is bounded by the 200-lesson limit). `completed` counts only completions whose lesson exists (the cascade keeps it so; the query joins anyway). The next lesson is `SELECT id FROM lessons l WHERE course_id = $1 AND NOT EXISTS (completion for $user) ORDER BY position LIMIT 1`.
5. **My Courses without N+1:** one grouped query per page: `SELECT course_id, count(*) total FROM lessons WHERE course_id = ANY($ids) GROUP BY course_id` and the same for completions, merged in memory; a test counts queries for 1 and for 25 courses and expects the same number.
6. **Course detail:** `progress` and `nextLessonId` are included only when the caller is an owner (the `enrolled` flag already needs `hasActive`; reuse that result).
7. **Account deletion:** register a deletion hook that deletes the person's completions inside the deletion transaction; a failing hook already cancels the deletion.
8. **App:** a `progress` query key `["progress", courseId]` read by the course page and invalidated by marking; My Courses items carry progress so cards need no extra requests. The reader's button is optimistic-free: it waits for the server (a lesson is small, a wrong "completed" is worse than a short wait), shows loading, and rolls forward from the response. The reader needs to know whether the person owns the course: it reads `["course", id].enrolled` (already fetched on the course page; fetched itself when the reader is opened from a link).
9. **No audit rows:** completions are the person's own learning data, not a staff action. Logs carry ids and outcomes only (tested).
10. **Out of scope data:** no timestamps per step, no time spent, nothing that could become surveillance of learners.

## Threat model (short)

- Marking someone else's progress: the user id always comes from the token, never the request.
- Marking without access: `hasActive` on every write; tested with a token that predates a revoke.
- Cross-course completion: the composite foreign key makes it impossible in the database.
- Probing which lessons exist: 403 before 404 for non-owners.
- Double submits and races: composite primary key plus `ON CONFLICT DO NOTHING`.
- Data left behind: deletion hook and cascade; tested.

## Migration and rollback

Additive table with `down.sql`, covered by the migration round trip (it needs a unique index on `lessons(id, course_id)`, added in the same migration). Rollback drops both. No existing data changes.

## Risks / Trade-offs

- Manual completion can be gamed by the learner; fine for a self-study product and recorded as such. The 90 percent video rule comes with video.
- Progress percentages move when staff add lessons; the text always shows counts so a drop is understandable.
- One more join on My Courses: bounded and tested for query count; no capacity claim.

## Open Questions (owner)

1. Approve Q07 for text lessons as a manual mark? (Proposed: yes.)
2. Should people who only read free previews be able to mark them? (Proposed: no, owners only.)
3. Should staff see student progress? (Proposed: later, as a scoped report.)
