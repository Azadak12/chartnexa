# Proposal

## Why
The student experience exposes course lists but gives too little prominence to the next learning action. The owner approved implementation of Home → My Learning → lesson completion on 2026-11-20 following review of the client trading-academy reference.

## What Changes
- Confirmed: prominent resume hero on Home and My Learning, expandable module journey, direct Start/Continue actions, and a completion panel leading to the next lesson.
- Preserve native mobile, white/black/blue branding, existing APIs and access rules.
- Out of scope: XP, streaks, assessments, leaderboards, new backend behavior, catalog redesign and unrelated deployment edits.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `mobile-my-courses`: direct lesson actions and expandable learning path.
- `mobile-continue-learning`: prominent resume placement with explicit loading and retry states.
- `mobile-lesson-progress`: server-confirmed completion panel and next step.

## Impact
Student mobile components and tests only; no new dependencies, APIs or migrations. Reference interaction ideas are adapted to React Native, not copied as a web app.
