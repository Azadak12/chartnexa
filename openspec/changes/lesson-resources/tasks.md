# Tasks

## 1. Server

- [x] 1.1 Storage and scanner interfaces with development adapters; production config refuses them.
- [x] 1.2 Migration with `down.sql`, contracts, octet-stream parser for parts.
- [x] 1.3 Upload start, parts, complete (checks, scan, once only), cancel; manage files; student list, links and byte serving; cleanup; verify 18 integration tests and 7 unit tests.
- [x] 1.4 Mutation checks (15, all caught) and CI route check.

## 2. App

- [x] 2.1 Student file list and opener in the lesson reader.
- [x] 2.2 Staff file section on the lesson form with picker, progress, cancel, retry, rename, download toggle, replace and delete.
- [x] 2.3 Component tests and a contract test against the real API.

## 3. Closing

- [ ] 3.1 Full checks, docs, decisions; archive after CI passes.

## Evidence (server part)

- Full local checks after the server part: lint, format, builds, typecheck, 484 API tests (25 new), 435 app tests, 36 contract tests, builds, secrets, migration round trip: all pass.
- Found by the tests and fixed: replacing a file turned downloads off, because the request schema defaulted `downloadable` to false; it is now optional and defaults only for new files.
- Mutation checks, all caught: declared type trusted; scan result ignored; download flag ignored when making a link and when serving; link expiry ignored; link not bound to its file; signature not checked; no access check for links; part size not checked; upload usable under another course; Word check skipped; storage path escape allowed; orphan grace ignored; old bytes kept on replace; replace resetting the download flag.

## Evidence (app part)

- Student side: the lesson reader lists files ("PDF, 1.0 MB, view only"), opens each through a fresh 5-minute link in the in-app browser, offers Download only when allowed, explains refused downloads and missing files in words, shows nothing for locked lessons and offers Retry when loading fails.
- Staff side (lesson form, after the lesson is saved): Add file with type and 50 MB checks before uploading, a title and a download switch, "Uploading, N percent" with Cancel, Try again after a failure, and per-file download switch, Rename, Replace (keeps the download setting) and Delete with confirmation; permission refusals are explained.
- Upload helper: parts read from the picked file, network failures retried up to 3 times per part, refusals not retried, cancellation tells the server. A fragile path was found and fixed: a cancel request that threw synchronously crashed the cancel path instead of reporting the cancellation.
- Tests: 11 new app tests (helpers, student and staff screens) and 1 new contract test that uploads a 6 MB PDF in two parts through the app's own code against the real API, then reads it back as an owner, with the stranger and a download refused. An existing test of `viewerFetch` now expects the options argument it gained.
- Full local checks: lint, format, builds, typecheck, 484 API, 446 app and 37 contract tests, API and app builds (the app bundle includes the new Expo modules), secrets scan, migration round trip: all pass. `pnpm audit:deps` passes; it reports two moderate advisories (`glob`, `minimatch`) inside Expo's build tooling, not in the new packages.
- New app dependencies: `expo-document-picker` 58.0.5, `expo-file-system` 58.0.14, `expo-web-browser` 58.1.0 (first-party Expo for SDK 58, MIT).
- Not verified: on real devices (the file picker, reading large files, the in-app browser showing PDFs and images, downloads on iOS and Android, screen reader order).
