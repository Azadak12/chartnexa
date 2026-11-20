# ChartNexa Cinematic Interactive Academy — Design System V1

Owner brief of 2026-11-21. This is the permanent baseline for design work; changes need explicit approval. Product constraints are unchanged: no new backend features, no invented XP/rewards/achievements, simulated charts are never presented as live data, every role keeps its existing features and permissions, and navigation is never gated behind an immersive scene.

## Philosophy
"Enter the market. Explore the knowledge. Interact with the concepts. Apply your learning. See your progress." Serious trading education with a premium, realistic, cinematic presentation, not a game. Cinematic imagery is larger for discovery, onboarding, course intros and major transitions, and compact for lessons, assignments, data entry, reports and management.

## Colour (tokens: `packages/design-tokens/src/colors.ts`)
| Role | Token | Value |
|---|---|---|
| Primary Midnight (page) | `colors.page` | `#07111F` |
| Deep Navy (surface) | `colors.surface` | `#101D32` |
| Elevated surface | `neutrals.surface` | `#192A42` |
| Primary action blue (fills, selected) | `colors.blue` | `#2878FF` |
| Link/small-text blue (action blue is 4.2:1 on the surface) | `colors.link` | `#6EA8FF` |
| Premium Champagne (editorial highlight, never a profit signal) | `colors.champagne` | `#D8AD66` |
| Ice White (text) | `colors.ink` | `#F5F8FC` |
| Secondary text | `neutrals.muted` | `#9DAFC5` |
| Bullish green / Bearish coral (market conditions, defined statuses) | `market.up/down`, `status.success/error` | `#16B89A` / `#F16B72` |
Dark text/icons on blue or champagne fills use `colors.onBlue`. Colour never carries meaning alone (words/icons always accompany it). Contrast pairings are enforced by `packages/design-tokens` tests.

## Typography
Inter (existing). Hierarchy via `typeScale`. All functional text is native text, never baked into imagery.

## Motion (tokens: `apps/mobile/src/motion/motion.ts`)
Touch 100-180 ms (`fast` 120), local 180-300 ms (`base` 240), navigation 250-450 ms (`navigation` 350), cinematic 450-900 ms (`cinematic` 600), ambient scenery 14 s loops that stop in the background. All motion respects Reduced Motion, never blocks actions, and never signals backend success before it is confirmed.

## Implementation status (honest)
Done: palette and contrast-checked tokens; raised-card surface; `StatusPill`; `StaffPageHeader`; responsive layout helper; motion tokens; Market City entrance with provisional art; winding learning path; mission cards; live-class tickets; Observatory header.
Not done: photorealistic artwork (see `market-city-assets.md`); light appearance token set; editorial display typeface; tabular numerals audit on figures; haptics; shared-element navigation transitions; lesson overlays/callouts; per-course themed imagery; device/simulator verification.
