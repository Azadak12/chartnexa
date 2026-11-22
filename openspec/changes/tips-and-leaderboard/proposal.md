## Why
Owner brief of 2026-11-22: add a Trading Tip of the Day and a Learners Leaderboard. The backend had no tips storage, no leaderboard and no learner privacy setting, and no XP, levels or achievements. Owner approved (in chat, same day): a new tips table with staff management, and a completed-lessons ranking that learners opt into. Development database only until the owner approves otherwise.

## What changes
- **Tips:** table `daily_tips` (category, text up to 240 characters, optional published course to "Learn more", active or archived). `GET /me/tip-of-the-day` returns one tip, chosen by the UTC date from the active tips in creation order, so it is the same all day and the set cycles before anything repeats. Staff list, add and archive tips with the existing `announcements:publish` permission (no new permission).
- **Leaderboard:** column `users.leaderboard_opt_in` (default false). `GET /leaderboard?period=weekly|monthly|all&courseId=` ranks opted-in learners with a display name by verified lesson completions (`lesson_completions`, which already enforces the 90% video rule and one row per lesson). `GET/PUT /me/leaderboard-settings` to opt in or out. Responses never contain user ids or emails.
- **Mobile:** Tip of the Day card on Home, Hall of Achievement screen with podium, opt-in control and period/course filters, tip management for staff.

## Not included (no data exists; nothing is invented)
XP, levels, achievements, streaks, quiz scores, mastery, avatars (initials only) and rank-change history. Ranking is only by completed lessons, never by quiz results, failures or trading.

## Impact
One migration (`20261122010000_tips_and_leaderboard`, with down script). Ranks are computed per request over opted-in learners; fine at pilot scale, needs a cache or table before large cohorts.
