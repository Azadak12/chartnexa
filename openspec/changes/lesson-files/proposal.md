# Proposal

## Why

The owner confirmed that lessons must carry real teaching material: video, PDF and other file formats. Text-only lessons (`course-lessons-basics`) are only the frame. Uploads are also the riskiest feature so far (untrusted files, large sizes, streaming, storage cost), so they get their own change with their own threat model, built on top of the lessons.

## What Changes

**Confirmation status**

- Confirmed by the owner (2026-11-18): staff can upload video, PDF and other formats to a lesson; permissions follow the lesson rules (Admins and Managers on every course, Instructors where assigned); Preview lessons are public and other lessons stay locked.
- Proposed, needs owner approval (recorded as R14 to R17 in the decision register):
  - R14: an allowlist, not "any file". Allowed: video MP4, MOV, WebM; PDF; images PNG, JPEG; Word DOCX. Never allowed: programs, scripts, archives, web pages, SVG, macro-enabled Office files. More formats can be added by the owner later, one at a time, after a safety check for each.
  - R15: size limits: video 500 MB, PDF and Word 50 MB, image 10 MB, at most 20 files per lesson.
  - R16: each file has a "Students can download" switch, off by default (Q04). Off means the app does not offer a download button and the server serves the file for viewing only. This cannot stop a determined person from saving what they can watch, and the app will not claim that it does.
  - R17: Word files are opened with the phone's own viewer or download; converting Word to a PDF preview is not planned for this change.
- Pending, blocks real launch and not this build: the production file storage (S3-compatible, region, cost; docs/05) and a real virus scanner. Until then files are stored on the developer's disk and the app refuses to start in production with the placeholder storage or scanner, so nobody can ship it by accident.

**Build**

- A file storage interface with a local-disk implementation for development and tests; the production implementation waits for the hosting decision.
- Staff API to upload a file to a lesson (streamed, size-limited while streaming, content checked against the real file signature, not the name), list, rename, set the download switch, and delete.
- A scanner interface; files are only served once they are marked clean.
- Viewing: a short-lived signed link per file, issued only after the permission check (staff with lesson access, or anyone for a clean file on a Preview lesson of a published course).
- App: staff pick and upload files from the phone with progress and Cancel; the lesson reader shows images, plays video, and opens PDFs and Word files in the phone's viewer.

**Out of scope**

- Resumable or chunked uploads and background uploads (large videos on a weak connection may need to be retried; recorded as a known limit), video transcoding or adaptive streaming, thumbnails, Word to PDF conversion, file versions, a shared media library, antivirus integration itself, access for enrolled students (needs enrollment), and any production storage account.

## Capabilities

### New Capabilities

- `lesson-files`: upload rules, checks, storage, scanning, viewing links and access for lesson files.
- `mobile-lesson-files`: picking, uploading, listing, deleting and viewing lesson files in the app.

### Modified Capabilities

None; this adds new behavior beside `course-lessons`.

## Impact

- API: `lesson_files` table and migration with reviewed `down.sql`, a file module, a storage and a scanner interface with development implementations, production-start guards, new routes, new audit actions, one new dependency for multipart (checked for license, age and support first).
- Contracts: file schemas and limits.
- Mobile: document and image picking, upload with progress, video playback and system viewers: new Expo packages verified against SDK 58 first.
- Docs: decision register (R14 to R17, Q04 partly resolved), READMEs, manual checklist (uploads and playback need a real device), production blockers noted.
- No secrets in the repo; no real cloud account is created.
