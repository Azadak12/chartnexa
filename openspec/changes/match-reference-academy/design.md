# Design

## Context

See proposal.md. Observed (code read, reference page seen at 375 px width): the app already matches the reference's palette, headings, 20 px cards, "UNIT n" cards with rings, 3D lesson path and press feedback. Confirmed missing in the app: the reference's Academy header structure (progress card with division strip, large division hero card). Not verified: how the mobile app looks on a device (no simulator or web renderer is available on this machine); all device checks are pending.

The reference is a Next.js app with its own database (about 40 tables) for XP, streaks, leagues, practice, AI tutor and admin. ChartNexa's backend (NestJS, Prisma) has courses, modules, lessons, lesson progress, entitlements, announcements and live sessions only.

## Goals / Non-Goals

**Goals:**
- Visual and structural parity with the reference's Academy and Home screens using only data ChartNexa stores.
- Clear, readable text; calm presentation.
- No backend, API, role or permission change.

**Non-Goals:**
- XP, streaks, hearts, leagues, mastery scores, AI tutor, simulator, journal, Chart Lab. They need new data models, server-side rules (idempotent awards, anti-exploit caps) and tests; each is its own future change.
- Real market data. Charts stay simulated and labelled.

## Decisions

1. **Division = course, unit = module.** ChartNexa has no "division" entity. Mapping a course to a division reuses real data and needs no migration. Alternative: add a `division` grouping above courses; deferred until the owner decides how courses are grouped.
2. **Strip from real progress.** Cards come from the student's own courses and their lesson progress; a card never shows a number the backend did not return.
3. **No mastery badge.** The reference's "Strong, 44% mastered" needs evidence-weighted skill tracking the backend lacks. Omitted until `practice-and-spaced-review` exists.
4. **Palette conflict resolved in the owner's favour.** Existing spec and `openspec/config.yaml` say white/black/blue, not dark; the owner chose the reference dark look on 2026-11-21. The design-system spec delta records this; the config context line is updated at apply time.
5. **Readability sizes** (body 17, caption 14, tab labels 12, lighter secondary `#A9B7D4`) are set in the shared token package so every screen inherits them.

## Risks / Trade-offs

- "Totally match" can be read as including every reference feature. Mitigation: the proposal states what is excluded and why; the owner confirms scope before any follow-up change.
- Larger text can overflow cards; mitigation: tests at narrow widths and 200 percent text scale.
- Dark, photographic hero may be what the owner finds "creepy"; unknown. Mitigation: open question below; art can be removed behind one flag per screen.
- No device verification yet; the preview build must be checked by the owner, and results recorded, before this change is archived.
- Rollback: UI-only; revert the commits and rebuild.

## Open Questions

- Which element feels "creepy": the lounge photo, the bull, the dark theme, the staff header photos? Decide before removing any art.
- Should courses be grouped into divisions (a data change), or is course = division acceptable?
- Which future change (XP and streaks, practice, AI tutor, simulator) comes first, and are real-time or paid AI services acceptable?
