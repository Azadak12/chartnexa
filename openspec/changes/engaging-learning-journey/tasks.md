# Tasks

## 1. Learning experience
- [x] 1.1 Implement shared resume hero, Home hierarchy, My Learning journey and direct course actions; verify navigation, empty/error states and journey interactions with mobile tests; document behavior.
- [x] 1.2 Implement confirmed lesson completion panel and reader presentation; verify completion, undo, failure and next lesson navigation tests; document behavior.

## 2. Integration
- [x] 2.1 Run typecheck, mobile unit suite, scoped lint/format and native exports; record results and remaining device checks.

## Verification evidence

- Existing mobile suite: 60 suites / 845 tests pass, including completion, undo, failed mutations, preview access and route regressions.
- New learning-journey suite: 10 tests pass after correcting the assertion for the shared error banner. Total passing coverage: 855 tests across 61 suites.
- Mobile TypeScript, scoped ESLint and Prettier, git diff whitespace check and strict OpenSpec validation pass.
- Both native production exports pass, including the production bundle verification script.
- No API contracts or backend code changed. Physical device visual and screen-reader checks were not performed; see docs/demo/learning-journey.md.
