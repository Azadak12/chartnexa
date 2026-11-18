# Tasks

## 1. Server

- [x] 1.1 Storage and scanner interfaces with development adapters; production config refuses them.
- [x] 1.2 Migration with `down.sql`, contracts, octet-stream parser for parts.
- [x] 1.3 Upload start, parts, complete (checks, scan, once only), cancel; manage files; student list, links and byte serving; cleanup; verify 18 integration tests and 7 unit tests.
- [x] 1.4 Mutation checks (15, all caught) and CI route check.

## 2. App

- [ ] 2.1 Student file list and opener in the lesson reader.
- [ ] 2.2 Staff file section on the lesson form with picker, progress, cancel, retry, rename, download toggle, replace and delete.
- [ ] 2.3 Component tests and a contract test against the real API.

## 3. Closing

- [ ] 3.1 Full checks, docs, decisions; archive after CI passes.

## Evidence (server part)

- Full local checks after the server part: lint, format, builds, typecheck, 484 API tests (25 new), 435 app tests, 36 contract tests, builds, secrets, migration round trip: all pass.
- Found by the tests and fixed: replacing a file turned downloads off, because the request schema defaulted `downloadable` to false; it is now optional and defaults only for new files.
- Mutation checks, all caught: declared type trusted; scan result ignored; download flag ignored when making a link and when serving; link expiry ignored; link not bound to its file; signature not checked; no access check for links; part size not checked; upload usable under another course; Word check skipped; storage path escape allowed; orphan grace ignored; old bytes kept on replace; replace resetting the download flag.
