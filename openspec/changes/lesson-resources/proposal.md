# Proposal

## Why

Workstream C of the owner's master prompt (2026-11-18): staff attach PDFs, images and Word documents to lessons; students view them securely; purchased materials must never sit behind permanent public URLs. No storage, CDN or scanning provider has been chosen, so this change builds provider-neutral boundaries with development adapters that production refuses.

## What Changes

- **Uploads (staff with `lesson:upload` for the course):** start an upload (name, declared type, size up to 50 MB), send 5 MB parts as raw bytes in any order (resending a part replaces it), then complete. Completing checks the bytes are really the declared type (PDF, PNG, JPEG, WebP, Word .docx, plain text), runs the malware scanner, and stores the file. Completing twice returns the same file; cancelling removes the parts. At most 20 files per lesson.
- **Files:** rename, toggle "students may download" (off by default, Q04 pending), replace the file (keeping its settings), delete. Every change audited with ids, type and size only.
- **Students:** list a lesson's files when they may read the lesson (free preview, or owners); ask for a link that is valid for 5 minutes; the link serves the bytes with `inline` (view) or, only when allowed, `attachment` (download), `no-store`, `nosniff` and a sandboxing CSP. Links are signed, bound to one file, and travel as a query value so logs never contain them.
- **Boundaries:** `ObjectStorage` (local-disk adapter for development and tests) and `MalwareScanner` (`NoScanner`, which marks files "not scanned"). Production refuses both until providers are chosen (Q32, Q33).
- **Cleanup:** every 15 minutes, expired uploads and bytes no file points at (for example after a lesson is deleted) are removed, with a one-hour grace period for uploads still committing.
- **App:** staff attach, rename, toggle download, replace and delete files on the lesson form; students see a lesson's files and open them. (Built in the second part of this change.)
- **Not included:** video (next change), Word-to-PDF preview (Q04 asks for it; needs a conversion service), offline downloads, DRM.

## Confirmation status

Built under the owner's standing instruction (2026-11-18). Q04 (what is downloadable) stays pending; the safe default (view only) is used. Providers are pending (Q32 storage/CDN, Q33 scanning).

## Capabilities

### New Capabilities
- `lesson-resources`, `mobile-lesson-resources`.

## Impact

- Tables `lesson_resources`, `upload_sessions`; new config `STORAGE_DRIVER`, `STORAGE_DIR`, `SCANNER`, `FILE_LINK_TTL_SECONDS`; production config refuses the development adapters. App dependencies `expo-document-picker` and `expo-file-system` (first-party Expo, SDK 58, MIT).
