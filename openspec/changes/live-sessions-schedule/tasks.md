# Tasks

## 1. Server
- [x] 1.1 Migration with constraints and down script; Prisma models
- [x] 1.2 Contracts (`live.ts`): limits, error codes, request and response schemas
- [x] 1.3 Provider boundary and manual-link adapter; `LIVE_PROVIDER`, `LIVE_JOIN_OPENS_MINUTES`
- [x] 1.4 Service and controllers: staff list/create/update/cancel, owner list/mine/join; audit without links; account-deletion hook
- [x] 1.5 Integration tests (19) incl. races, windows, permissions, database constraints; mutation checks (15 mutations, all caught after one new test)

## 2. App
- [x] 2.1 API client and local time helpers
- [x] 2.2 Course page section and home card with join
- [x] 2.3 Staff list, full-screen form, cancel sheet; entry from the course management screen
- [x] 2.4 Screen tests (18) and contract test against the real API; mutation checks (8, one equivalent survivor: the button's loading state already blocks a second tap)

## 3. Wrap-up
- [x] 3.1 OpenAPI route list in CI, READMEs, decision register (R38), progress tracker
- [ ] 3.2 Full checks; archive after CI passes
