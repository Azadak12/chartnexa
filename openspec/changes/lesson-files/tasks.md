# Tasks

Prerequisites: `instructor-permission-delegation` and `course-lessons-basics` are merged.

## 1. Server foundations

- [ ] 1.0 Verify the new packages before adding them (multipart parser for the API; document picker, file-system upload with progress, video player and system file opener for the app): license, release age, Expo SDK 58 compatibility, and a passing install under the pnpm release-age rule; record the results in the change evidence and stop for a decision if any package is unsuitable.
- [ ] 1.1 Add the `lesson_files` and `file_cleanup` tables, CHECKs and migrations with reviewed `down.sql`; verify `pnpm migrate:roundtrip` passes and tests show the database rejects a negative size, an unknown status and a duplicate storage key.
- [ ] 1.2 Add file schemas, allowed types and limits to `packages/api-contracts`; verify unit tests for each limit, display-name cleaning and the public file shape.
- [ ] 1.3 Implement the storage interface, the local-disk implementation (random keys, temporary name then rename, owner-only, no overwrite, cleanup on failure) and the production guard; verify tests for path-hostile keys, an aborted stream leaving nothing, concurrent writes, and production start refusing the local driver.
- [ ] 1.4 Implement signature detection for the seven allowed types; verify tests with real sample bytes for each, disguised files (program named `.pdf`, PDF claiming to be an image, SVG, HTML, macro-enabled Word, archive), empty and truncated files.
- [ ] 1.5 Implement the scanner interface, the development scanner, the production guard and the startup sweep of pending files; verify tests for clean, rejected (file removed, record kept, never served), a process stopping between upload and scan, and production start refusing the development scanner.

## 2. Server API

- [ ] 2.1 Implement upload (streamed, cap enforced while streaming, type from signature, 20-file limit under the lesson lock, permission re-check at insert, audit in the same transaction); verify integration tests for every scenario in `lesson-files` upload rules including oversized streams stopped early, too many files, grant removed mid-upload, foreign lesson id, storage failure leaving no record, simultaneous uploads at the limit, and the per-person upload rate limit.
- [ ] 2.2 Implement list, rename, download switch and delete with the cleanup retry list; verify tests for permissions (Admin, Manager, Instructor with and without grant, Student, signed out, identical 403 bodies), audit content without file text, and delete leaving no viewable orphan even when storage deletion fails once.
- [ ] 2.3 Implement viewing links and the file endpoint with the safe headers and range support; verify tests for staff, public preview, locked, draft, pending and rejected files, expired, altered and wrong-file links, Preview turned off, range requests including invalid ranges, every required header, and that no locked file's bytes can be fetched without staff rights.
- [ ] 2.4 Update the OpenAPI route check in CI for the new routes and add the new configuration (storage folder, link secret) to `.env.example` with development values only; verify the check passes and configuration validation fails without the secret.

## 3. App

- [ ] 3.1 Add the app API layer for files and the Files section on the staff lesson screen with listing and statuses; verify tests for each state and for access denied requesting nothing.
- [ ] 3.2 Build Add file with the allowed-format note, pre-checks, progress, Cancel, leave-while-uploading confirmation and every failure path (offline, 400, 403, 413, 429); verify tests for each scenario in `mobile-lesson-files` with a fake upload.
- [ ] 3.3 Build rename, the download switch and delete; verify tests for confirm, cancel, back, double tap sending one request, and 403 and 404 handling.
- [ ] 3.4 Build the reader's file viewing (image, video, PDF and Word through the system viewer, expired link refresh, locked and removed states); verify tests for each type, one silent link refresh, and no files listed for locked lessons.
- [ ] 3.5 Accessibility pass (labels, targets, announced progress and results, video controls, large text); verify with tests of roles, labels and announcements, and list what cannot be checked without a device.

## 4. Verification and docs

- [ ] 4.1 Extend the contract tests with a real flow against the API (Manager uploads a PDF, a PNG and an MP4 sample; a disguised file and an oversized file are refused; a student gets links only for the Preview lesson; locked and deleted files fail; an Instructor with and without the grant); verify they pass locally and in CI.
- [ ] 4.2 Record R14 to R17 and the production blockers (storage provider, real scanner) in `docs/10_DECISION_REGISTER.md`, update the READMEs (endpoints, limits, formats, phone walkthrough, how the placeholders are guarded) and the manual device checklist (real upload from a phone, video playback and seeking, PDF and Word opening, airplane mode during upload); verify by following the walkthrough in a fresh clone.
- [ ] 4.3 Run the full `pnpm check` from a fresh clone, confirm CI is green, and write the evidence including what could not be verified on this machine (device uploads, playback, system viewers, real storage and scanning).
