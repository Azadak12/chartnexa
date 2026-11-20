# Design

## Context
Existing resume data includes the next lesson, course title and counts. The owned-course list has counts but no next lesson ID; the course detail endpoint supplies it. Existing outlines include modules and progress supplies completed IDs.

## Goals / Non-Goals
Keep every learning action grounded in server data. No artificial rewards, learning locks or guessed completion state.

## Decisions
Use a shared resume surface with an optional expandable journey on My Learning. Fetch outline and progress only when expanded, avoiding per-card requests. Keep title taps opening course details; explicit Start/Continue fetch current detail and open the next lesson. Keep completed courses available for review. Build path rows from existing module order, using labels and icons alongside color. Reuse existing completion mutation and cache invalidation; present completion only when confirmed progress says done. Respect reduced motion with existing reader transitions.

## Risks / Trade-offs
- Partial course pagination → label totals as loaded so far and preserve pagination/retry.
- Stale access → current detail and lesson endpoints still authorize; show human-readable errors and refresh on refusal.
- Narrow screens and large text → wrapping layouts, growing controls, no fixed text heights; 44-point targets and accessible expanded state.
- Network failures → independent resume/path retry, existing library remains usable; no optimistic celebration.

## Observability and threat model
Use current API error mapping and request IDs; no new logging or personal-data collection. UI never grants access. Existing submit lock prevents duplicate completion calls; server remains authoritative.

## Migration Plan
No migration or dependency changes. Revert the student component changes to roll back. Verify typecheck, focused interaction tests, full mobile unit suite, lint and native bundle exports. Physical-device visual/accessibility checks remain explicitly unverified if unavailable.
