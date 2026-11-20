# ChartNexa Academy — working brand kit

## Brand
Temporary name **ChartNexa Academy**, short **ChartNexa**. Proposed tagline: *Learn the Market. Master the Skills.* Logo direction: open book + stylized candlestick chart; working asset `assets/ChartNexa_Working_Logo.png` is **placeholder** only, not production-validated.

> **Superseded 2026-11-21** (see `docs/10_DECISION_REGISTER.md`): the owner adopted the trading-academy reference design. The app is now dark-first: page `#070B14`, surface `#0F1628`, ink `#E8EEFB`, primary blue `#3D8BFF` with dark `#0B1020` text on it, gold `#F5C542` for rewards. Source of truth for values: `packages/design-tokens/src/colors.ts`. The white/black/blue rules below are historical.

## Exactly three brand hues
- **White `#FFFFFF`** — dominant page background and cards.
- **Black `#111111`** — heading, text, core icons.
- **Blue `#2563EB`** — primary CTAs, selected navigation, focus, important icons, selected sections.
- **Tints and functional neutrals** are derived from these; use `#EFF6FF` as *blue tint* for highlights, and neutral grays for borders, disabled and muted text. Error/success colors may be introduced where necessary for **accessibility and unmistakable status**, but not as additional marketing brand hues. Do not encode status in color alone.

## Visual system proposals
- Typography: Inter (subject to embedding/licensing/platform review); reliable system fallback.
- Spacing: 4px base, generally 8/12/16/24/32px steps.
- Radius: 12px inputs and controls; 16px cards; rounded sheets.
- Touch targets: **at least ~44x44 pt** or applicable platform accessibility minimum.
- Buttons: blue background + white text, secondary outlined blue, tertiary text, disabled states.
- Surfaces: predominantly white; avoid unnecessary gradient, heavy shadows, dense graphs.
- Learning video player can be dark for media contrast, but **do not turn the entire application dark** by default.
- Icons: consistent Lucide-style line art, blue for selected / key actions.
- Responsive: reference around 390 logical px wide, smaller/larger testing, tablet considerations, landscape video.

## Required Figma/implementation component families
Text, buttons, inputs, validation/error messages, tabs, bottom navigation, back headers, course cards, ratings, price blocks, curriculum lists, lesson row, video player, file cards, progress, bottom sheets, dialogs, skeletons, toast/banner, tables for large screens, permission switches, empty/offline/error states.

## Experience principles
1. Student course browsing should be simple and fast.
2. When viewing reviews or an announcement, use a contextual sheet/inline panel if content is short; return to the original scroll position.
3. Avoid forced navigation chains; preserve the user's place after login and payment.
4. Show course access and payment state clearly.
5. No misleading fake timers, fake scarcity, fabricated ratings, manipulative prompts or prechecked purchases.
6. Respect accessibility, localization-ready layout, reduced-motion setting and slow connections.

## Assets
`assets/ChartNexa_Working_Logo.png` — working asset; replace with properly exported vector/icon variants and test on light background before production.
