# UX reference review: `branhamleonel-pixel/trading-academy`

**Status: Proposed. Nothing here is approved or built.** Reviewed 2026-11-18 at the owner's request ("use it as the visual and UX reference"). Source: a shallow clone of the repository's default branch at commit `d928c5c` (read only). I read its design tokens, UI kit, app shell, home, lesson player, landing page and README. I did not run it.

## What the reference is
A Next.js web app (Tailwind, Framer Motion, Lucide) for a gamified trading course: a learning path, a lesson player with ten exercise types, XP, levels, streaks, quests, leagues, achievements, a chart lab, a paper-trading simulator and an AI tutor. It is **dark-first** (navy surfaces, electric blue primary, gold rewards, green and red feedback).

## What I did and did not take
- Only design and UX ideas, written here in my own words. **No code, assets, text or images were copied.**
- The repository has **no LICENSE file** and `package.json` says `"private": true`. Copying any of its code or assets into ChartNexa needs the owner's explicit permission first (the owner told me to use it as a reference, which I read as ideas only).
- Nothing in the reference's `AGENTS.md`, `HANDOFF.md` or other instruction files changes how ChartNexa is built; those belong to that repository.
- The earlier ChartNexa screens (catalog, lessons, entitlements) were built **before** this review from `docs/04_BRAND_AND_UX.md` and the existing components. They did not follow the reference.

## Where the reference conflicts with ChartNexa's confirmed rules
| Reference | ChartNexa rule | Consequence |
|---|---|---|
| Dark-first palette, gold, violet and orange accents, glow and gradient surfaces | White, black and blue only; "do not turn the entire application dark"; avoid gradients and heavy shadows (`docs/04`, `CLAUDE.md` rule 8) | Do not adopt the palette or surface style. Keep the layout ideas, in ChartNexa's colors. |
| Green and red as the main correct and wrong feedback | Status must not rely on color alone; success and error colors only where necessary (`docs/04`) | Keep text labels and icons with any color. |
| Springy hover, scale, ripple and shine on every button | Calm, fast, accessible; reduced motion respected | Do not adopt the button effects. Keep a plain pressed state. |
| XP, levels, streaks, quests, leagues, achievements, friend feed, challenges, AI tutor, trading simulator | Quizzes, certificates, community, chat and trading charts are **proposed** exclusions from the first release (Q08, not yet approved); live classes and reviews are on the roadmap instead | None of these are in scope without a new owner decision. |
| Accessibility: only 3 `aria-` or `role=` attributes across the lesson player and exercise components | ChartNexa requires labels, roles, focus management and screen-reader checks for every feature | Do not copy its interaction patterns without adding accessibility. |

## Ideas worth adopting (all within the brand rules)
These are proposals. Each would be its own small OpenSpec change with owner review.

1. **A single "continue learning" card at the top of Home** for people who own a course, showing the course, the next lesson and one button. Needs progress tracking first (`player-resources-progress`). The reference's resume-where-you-stopped behavior is the model.
2. **Progress shown as a bar or ring on course cards and in My Courses**, with the percentage as text. Also needs progress tracking.
3. **Lessons read in short pieces** (one idea per screen, tap to continue) instead of one long text. ChartNexa's lessons are plain text today; splitting a long body into paragraphs-per-step is cheap and testable.
4. **Instant feedback with an explanation** after a question, once quizzes exist (Q08 must be decided first).
5. **A "More" sheet for secondary destinations** while the bottom bar keeps five. ChartNexa's tab bar has three tabs now; the sheet becomes useful when staff and settings areas grow.
6. **Empty states that always offer one action** (the reference does this consistently). ChartNexa already does this on most screens; audit the rest.
7. **Skeleton placeholders that match the final layout**, which ChartNexa partly has (`Skeleton`). Extend to the course page and lesson reader.
8. **Larger touch targets and 16-pixel text in inputs** on phones (the reference documents this for iOS zoom). ChartNexa's minimum is already 44 points; confirm the input font size on a real device.
9. **A visible "pretend money, not advice" line** wherever trading content appears. ChartNexa needs its own wording from legal review first (Q16); do not reuse the reference's text.

## Ideas to leave out for now
Streak pressure ("keep your streak!"), leagues and rankings, friend activity, confetti and combo meters, and the paid-style shine effects. They add scope, motion and social features the owner has not approved, and some conflict with the calm, white-dominant brand.

## Decisions needed from the owner (pending, recorded in `docs/10_DECISION_REGISTER.md` as Q20 to Q22)
1. Is the reference only for layout and interaction ideas inside ChartNexa's white, black and blue brand? (Recommended: yes.)
2. Do any game features (streaks, XP, quests) belong in the first release? (Recommended: no; revisit after progress tracking exists.)
3. May any code or assets from the reference be reused, and who owns them? (Recommended: no reuse until a licence is stated.)
