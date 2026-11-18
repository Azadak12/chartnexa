# Design

## Context

- Depends on `course-lessons-basics` (lessons, ordering, public preview rules) and on `instructor-permission-delegation` (the per-course `lesson:upload` grant).
- Decisions already on record: Q04 proposes a per-file download flag, default off, video stream-only; docs/05 proposes S3-compatible storage with a CDN and a separate video pipeline for long lectures; the roadmap names `asset-upload-pipeline` with allowlist, MIME and content check, scan, size limits, resumable uploads and re-authorization at finalize (S4).
- Hosting, region and the storage provider are not decided, so no cloud account or credentials exist and none are created here.

## Goals / Non-Goals

**Goals:** accept only safe files; never serve locked or unchecked content; keep storage swappable; work end to end on a developer machine and a phone; refuse to run the placeholders in production.

**Non-Goals:** resumable or background uploads, transcoding or adaptive streaming, thumbnails, Word to PDF conversion, antivirus integration, a media library, enrollment-based access, production storage.

## Decisions

### D1. Storage behind an interface
`FileStorage { put(key, stream, maxBytes) -> {size, sha256}; get(key, range?) -> stream; delete(key) }`. A `LocalDiskStorage` writes under a configured folder outside the repository and the web root, creating files with owner-only permissions and `wx` (never overwrite). `put` writes to a temporary name and renames on success; on any failure it deletes the temporary file. An S3-compatible implementation is the production path but waits for the hosting decision; production config validation refuses `STORAGE_DRIVER=local`, exactly like the existing mailer guard. Alternatives: store bytes in PostgreSQL (simple but bloats backups and hurts video); build S3 now (no account to test against, would be untested code).

### D2. Streaming upload with a cap, then verify the signature
`POST /staff/courses/:courseId/lessons/:lessonId/files` is multipart, one file field, streamed. A byte-counting transform stops the stream at the type's limit. The first 4 KB are read for the signature before the rest is accepted: MP4 and MOV by `ftyp` box brand, WebM by the EBML header with doctype `webm`, PDF by `%PDF-`, PNG and JPEG by magic bytes, DOCX by the ZIP header plus a `[Content_Types].xml` entry naming the Word main part (macro-enabled `.docm` content types rejected). The detected type decides the limit and the stored type; the claimed MIME and the file extension are ignored except to build a display name. Signature checks are small hand-written functions for the seven allowed types, so no sniffing dependency is trusted with the decision; each has tests with real sample bytes and with disguised files. Deeper validation (parsing the video, scanning PDFs for active content) is the scanner's job.
The multipart parser is `@fastify/multipart` (MIT, maintained by the Fastify team, matches the Fastify 5 line). Its version, release age and license are verified before it is added (CLAUDE.md), and pnpm's release-age rule is respected by pinning an older release if needed.

### D3. Records, states and the scanner
`lesson_files(id, lesson_id FK lessons, course_id, storage_key unique, display_name, detected_type, size_bytes, sha256, status pending|clean|rejected, reject_reason, downloadable bool default false, created_by, created_at, updated_at)`; CHECKs on size and name length; at most 20 per lesson is checked under the lesson row lock. `Scanner { scan(key) -> clean | rejected(reason) }`. After the upload record is committed as `pending`, the scan runs, then status flips to `clean` or the file is deleted and marked `rejected` (record kept so staff see why). The development scanner is a placeholder that marks everything clean and logs `scanner=dev`; production config validation refuses it (D1 rule), and the docs list "real scanner" as a launch blocker. If the process dies between upload and scan, a startup sweep rescans `pending` files older than a minute. No pending or rejected file is ever served.
Because the scan happens right after the upload in the same request for the development scanner, the app shows Checking only briefly; a real scanner can finish later without changing the API.

### D4. Authorization, with a re-check at the end of the upload
Staff routes use `@RequirePermission("lesson:upload", { resource: courseOf })` like lessons. Upload is long, so permission is checked at the start and re-checked in the same transaction that inserts the record: if the grant was removed meanwhile the stored file is deleted and 403 is returned (roadmap item S4). The lesson id is always resolved inside the course from the address.

### D5. Viewing links
`POST /courses/:courseId/lessons/:lessonId/files/:fileId/link` (public, optional sign-in) decides: staff with `lesson:upload` on that course get a link for any clean file; everyone else only for a clean file of a Preview lesson of a published course; locked lesson answers 403 with the "available after enrolling" message, anything else 404. The link is `GET /files/:token`, where the token is an HMAC (key from config, validated like the other secrets) over `{fileId, expiresAt}` with a five-minute life, constant-time compared. The file endpoint loads the file, requires `clean`, and serves it; it does not know who asked, so a link is a short-lived capability. Trade-off accepted: a link already issued works until it expires even if Preview is turned off; deleting a file removes it so the link fails at once. Alternatives: bearer header on every request (breaks system PDF viewers and some video players), cookies (mobile hassle).

### D6. Serving
Headers on every file response: `Content-Type` from the stored detected type, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-store`, `Accept-Ranges: bytes`; `Content-Disposition: inline` for video, PDF and images and `attachment` for Word. Range requests (single range) are served as `206` with correct `Content-Range`; invalid ranges answer `416`. The download switch controls only whether the apps show Download and whether the app asks the system to save; it is honest that a viewer on a device can still capture what they watch.

### D7. Delete and cleanup
Delete removes the row and the stored bytes in that order inside a guarded flow: row deletion commits first; storage deletion runs after, and failures go to a small `file_cleanup` retry list processed at startup and on a timer, so a failed delete leaves no viewable orphan (the row is gone, so no link can serve it) and no permanent junk. Deleting a lesson (from `course-lessons`) calls the same cleanup for its files; if the lessons change is merged first, it gets a hook here.

### D8. Audit
`file.upload` (ids, detected type, size, sha256), `file.rename`, `file.download_switch` (before, after), `file.delete`, `file.reject` (reason code). Rejected uploads before storage are recorded as denied events with a reason code (type, size, count). No content and no raw filename.

### D9. App
- Staff lesson screen gains a Files section: list with status text, Add file (document picker for any of the allowed types; image picker is not needed because documents include images), progress bar with Cancel, Rename sheet, download switch, Delete confirmation. Pre-checks type and size from the picked file's metadata before sending; the server remains the authority.
- Upload uses the platform's native upload with progress and abort so large files are streamed from disk, not read into memory. The package is verified against Expo SDK 58 first (task 1.0): a document picker, a file-system upload with progress, a video player (`expo-video`) and a way to open PDF and Word files in the system viewer.
- Reader: lesson files list for Preview lessons; each opens by asking the API for a fresh link; images in an `Image` with accessibility label, video in the video player with its own controls, PDF and Word via the system viewer. If a request returns 403, the app refetches a link once, then shows a plain message.
- Gating: `canManageLessons(access, courseId)` from the previous change.

### D10. Threat model
- Malicious file types: allowlist by real signature, rejected otherwise; SVG and HTML never allowed; Word macros rejected.
- Active content inside allowed types (PDF scripts, Office tricks): contained by serving rules (sandbox CSP, no-sniff, attachment for Word) and left to the scanner; recorded as a launch blocker until a real scanner exists.
- Path traversal and name tricks: random storage keys, display name cleaned and never used as a path.
- Resource exhaustion: caps enforced while streaming, 20 files per lesson, existing rate limits on authenticated writes plus a stricter limit on uploads per person per hour (config), temporary files removed on failure; disk quota for the development folder is documented.
- Unauthorized viewing: link issued after a permission check, five-minute HMAC capability, `clean` required, preview and publish rules re-checked at issue time; leak tests assert no locked file can be fetched without staff rights.
- IDOR: ids always scoped by course and lesson in the address; same 403 for missing and ungranted.
- Races: lesson row lock for the 20-file count; re-check of permission at insert; deferred cleanup list for failures.
- Privacy: audit holds ids and types, never content; file names are staff-written text and are shown only as display names.

### D11. Observability
Log upload accepted or rejected with reason code, size and detected type (no names), scan result, link issued or refused, cleanup retries. Counters by reason code. No content ever logged.

### D12. Migration and rollback
Two additive migrations (`lesson_files`, `file_cleanup`) with reviewed `down.sql`; round-trip test in CI. Rollback of code leaves unused tables and stored files on disk; the runbook says how to delete the folder in a development environment. Nothing in production exists to migrate.

## Risks / Trade-offs

- Large videos over mobile networks can fail without resume; staff retry. Resumable uploads are a follow-up if it hurts. Video is not transcoded, so a phone must be able to play the uploaded codec; the docs tell staff to use MP4 (H.264).
- The local-disk storage and the development scanner are placeholders; two production guards and two documented blockers keep them from shipping by accident. Real storage and scanning must be chosen before any real launch.
- Signed links stay valid for up to five minutes after Preview is turned off.
- "View only" is a product setting, not protection from capture; the app text must not promise it.
- A new multipart dependency and several Expo packages add supply-chain surface; each is verified and pinned, and audit stays green.

## Open Questions

- R14 to R17 need owner approval, especially the format list (add only formats you really need; each new type needs a safety check), the size limits, and the default of downloads off.
- Which storage provider and region, and which virus scanner, for production (docs/05): needed before launch, not before this build.
- Are video lectures longer than about 500 MB expected? If so, the separate video pipeline (docs/05) should be planned next instead of raising this limit.
