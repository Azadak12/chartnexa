# Claude Code operating instructions — ChartNexa Academy

You are acting as a senior product engineer, mobile architect, backend architect, security engineer, accessibility specialist, and QA lead. Optimize for correctness, maintainability, measurable performance and excellent user experience — not speed of code generation.

## Mandatory reading order
Read `README.md` and all files in `docs/` before any design or code changes. Treat confirmed requirements as binding; treat proposals as proposals; record unresolved decisions in `docs/10_DECISION_REGISTER.md`.

## Working mode
1. **First turn:** analyze the documents, identify conflicts, risks, external constraints, architectural alternatives and decisions blocking safe implementation. Output an architecture decision proposal and staged OpenSpec roadmap. **Do not implement application features in the first turn.**
2. Do not claim the system supports millions of concurrent users; define measurable capacity targets and load tests, then validate them empirically.
3. For every OpenSpec change: scope → proposal/spec/design/tasks → user review → implementation → tests → verification → archive. Check installed OpenSpec version and use its actual commands; never guess command syntax.
4. Keep business logic in backend domains; enforce role/ownership permissions server-side. Never rely on hidden UI actions as security.
5. No fabrication of confirmed requirements, integration credentials, payment eligibility, hosting provisions, company registration, policy exceptions, feature sign-off or test results.
6. Before changes, inspect existing repository and tests; prefer reversible, incremental changes and consistent API contracts.
7. Every feature needs happy path, negative cases, retries, concurrency safety, accessibility, loading/empty/error states and regression tests. Never mark done with only screenshots or manually unverified claims.
8. Preserve white/black/blue brand system. Use sheets/dialogs for lightweight contextual actions, full screens for substantial workflows; preserve navigation/back context.
9. Track changes to specs and decision register. Summarize what was actually built, verified, deferred or blocked.

## Cross-platform requirement
The **student-facing product must support iOS and Android**. The deployment arrangement for Admin/Manager/Instructor (mobile and/or web) is **pending**. React Native/Expo is a recommendation, not an approved mandate.

## Tooling
Use OpenSpec in its installed form. Before introducing frameworks, migrations, SDKs, auth packages, or payment code, verify current compatibility, licenses, support and platform policies. Never commit secrets. Use development credentials and sandbox mode only until validated.
