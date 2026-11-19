# Design
- One query ranks up to 20 owned courses by latest activity (completions and video progress, falling back to the enrollment time); counts come from the existing batched `loadCourseCounts`, and the first course with a next lesson wins. Ties break on course id, so the answer is stable.
- Revoked access never counts; other people's activity never counts (every query is scoped to the caller from the token).
- The app refetches the card on every visit (`staleTime: 0`) so finishing a lesson moves it on.
