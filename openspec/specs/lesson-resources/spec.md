# lesson-resources Specification

## Purpose
TBD - created by archiving change lesson-resources. Update Purpose after archive.

## Requirements

### Requirement: Staff upload checked files to lessons
A person allowed to author a course's lessons SHALL be able to upload files of up to 50 MB in parts and attach them to a lesson. The server SHALL accept only PDF, PNG, JPEG, WebP, Word (.docx) and plain text, judged by the bytes, and SHALL run the malware scanner before storing a file.

#### Scenario: Upload in parts
- **WHEN** staff send all parts (in any order, retrying any) and complete
- **THEN** one file is stored with its size and hash, the parts are removed and the change is audited without the file name

#### Scenario: Content does not match
- **WHEN** the bytes are a program, another type than declared, or a zip that is not a Word document
- **THEN** completing answers a field error on `file` and nothing is kept

#### Scenario: Infected
- **WHEN** the scanner reports malware
- **THEN** the file is refused and nothing is kept

#### Scenario: Incomplete or wrong parts
- **WHEN** a part has the wrong size or number, or a part is missing at completion
- **THEN** the part is refused, or completion answers 409 `UPLOAD_INCOMPLETE`

#### Scenario: Complete twice
- **WHEN** completion is sent several times at once
- **THEN** exactly one file exists and every successful answer names it

#### Scenario: Cancel
- **WHEN** an upload is cancelled
- **THEN** its parts are removed, cancelling again succeeds and further parts are refused

#### Scenario: Limits and permission
- **WHEN** a lesson has 20 files, the file is over 50 MB or of another type, or the caller may not author the course
- **THEN** the upload is refused with 409, 400 or 403

### Requirement: Staff manage a lesson's files
Staff SHALL rename a file, turn downloads on or off (off by default), replace its bytes keeping its settings, and delete it.

#### Scenario: Replace
- **WHEN** a file is replaced
- **THEN** the new bytes take its place, its download setting is kept and the old bytes are removed

#### Scenario: Stale edit
- **WHEN** an edit carries an old version
- **THEN** it answers 409

### Requirement: Students read files through short-lived links
A person who may read a lesson SHALL be able to list its files and get a link valid for minutes. The link SHALL serve the file to view, or to download only when staff allowed it, and SHALL stop working when it expires, is altered or downloads are turned off.

#### Scenario: Owner views a file
- **WHEN** an owner opens a file
- **THEN** it is served inline with no-store, nosniff and a sandboxing policy

#### Scenario: Not allowed
- **WHEN** a stranger asks about a locked lesson's files, or anyone uses a forged, altered, expired or other file's link
- **THEN** the answer is 403 or 404 and no bytes are sent

#### Scenario: Download
- **WHEN** a student asks to download a file that staff did not allow
- **THEN** the answer is 403 `DOWNLOAD_NOT_ALLOWED`

### Requirement: Leftover bytes are cleaned up
Expired uploads and stored bytes that no file refers to SHALL be removed periodically, keeping bytes younger than one hour.

#### Scenario: Lesson deleted
- **WHEN** a lesson with files is deleted and the cleanup runs after the grace period
- **THEN** the files' bytes are removed
