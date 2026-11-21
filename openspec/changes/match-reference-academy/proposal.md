# Proposal

## Why

The owner wants the student app to match the reference academy running at `localhost:3100/academy` (`~/trading-academy`): same look, same structure, same sense of progress. Today the app follows its palette, fonts and card style, and has the lesson path, but the top bar, the division/unit structure of the Academy screen, and most of the reference's sections are still missing. The owner has said backend additions are acceptable ("no worries"), but also "no fake counters": every number shown must come from real stored data.

## What Changes

Confirmed by the owner (2026-11-21): copy the reference's design; copy the top bar and division strip; no fake counters; backend additions allowed; text must be clear and readable; the design must not feel "creepy" (the owner has not said which element; the dark photo hero is the main candidate, see design.md open questions).

Delivered in this change (Phase 1, design plus real data only, no new backend):
- Top bar: brand mark, bell with real unread count, profile circle with initials (built, on `main`).
- Course strip on Home from the student's real courses (built, on `main`).
- Readability: larger body and caption text, lighter secondary text, larger tab labels (built, on `main`).
- Academy screen structure matching the reference: a "Your progress" card containing the division strip, a large division hero card (name, description, lessons done of total), and unit cards over the existing lesson path. "Division" maps to a **course** and "unit" to a **module** (see design.md).
- Sign-in and sign-up match the reference's login layout.
- Update the `design-system` spec, which still says "white, black, blue; not dark", to the reference palette the owner chose.

Staged as separate future OpenSpec changes (Proposed, not started; each needs backend work and an owner decision on scope): `learning-xp-and-streaks`, `practice-and-spaced-review`, `chart-lab-exercises`, `ai-tutor`, `leaderboards-and-achievements`, `trading-journal`, `trading-simulator`. None are in this change. The reference's own status document lists them as implemented there, with about 40 tables of data; they are weeks of work, not a styling pass.

## Capabilities

### New Capabilities
- `mobile-app-chrome`: the top bar (brand, announcements bell, profile circle) and the bottom tab bar's readable labels.
- `mobile-academy-path`: the Academy screen structure: progress card with course strip, course hero card, unit cards.

### Modified Capabilities
- `design-system`: brand palette, typography and readability requirements change from white/black/blue light theme to the reference dark palette with Plus Jakarta Sans headings and larger text.

## Impact

- Mobile only: `apps/mobile/src/kit/AppHeader.tsx`, `src/home/HomeScreen.tsx`, `src/entitlements/screens/MyCoursesScreen.tsx`, `src/progress/LearningJourney.tsx`, auth layout; `packages/design-tokens`.
- No API, database, role or permission changes in this change.
- Requires a new store build to reach devices (no over-the-air updates).
- Conflicts: `openspec/config.yaml` still says "do not make the whole app dark" and "brand: white, black, blue"; the owner's choice supersedes it, so the config context line must be updated when this is applied.
