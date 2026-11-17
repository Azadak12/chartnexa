# ChartNexa Academy — Claude Code + OpenSpec Starter Package

**Version:** 1.1 working draft — 17 November 2026. **Project status:** specification and architecture planning, **NOT** implementation approved.

## Start here
1. Open this folder in Claude Code.
2. Read `CLAUDE.md` and the `docs/` folder.
3. Paste `START_HERE_PROMPT.md` into Claude Code.
4. Ask Claude to audit requirements and propose architecture before editing application code.
5. Approve architecture and one small OpenSpec change at a time.

## Source-of-truth / document order
- `docs/01_PRODUCT_OVERVIEW.md`: vision, confirmed decisions, unknowns.
- `docs/02_FEATURES_BY_ROLE.md`: student, instructor, manager, admin capabilities.
- `docs/03_USER_JOURNEYS_AND_SCREENS.md`: screens, flows, UX behavior.
- `docs/04_BRAND_AND_UX.md`: white/black/blue brand tokens and design rules.
- `docs/05_TECH_STACK_AND_ARCHITECTURE.md`: recommended stack and scaling approach.
- `docs/06_BUSINESS_RULES_AND_EDGE_CASES.md`: non-happy paths and policies.
- `docs/07_SECURITY_AND_DATA.md`: security, privacy, data model.
- `docs/08_QUALITY_AND_TESTING.md`: verifiable definition of done.
- `docs/09_OPENSPEC_ROADMAP.md`: sequenced implementation changes.
- `docs/10_DECISION_REGISTER.md`: confirmed, proposed and pending choices.

**Crucial:** 'proposed' ≠ 'confirmed'. Mobile iOS+Android is confirmed. A separate Next.js web management panel is **recommended but NOT approved**. Stripe is confirmed as desired, but purchase implementation must respect app-store rules. Do not turn pending details into facts.
