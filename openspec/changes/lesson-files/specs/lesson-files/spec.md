# Spec Delta

## Purpose
Defines how authorized staff attach files to a lesson, how every upload is checked and stored safely, and who may view a file, so teaching material can be shared without exposing locked content or accepting dangerous files.

## ADDED Requirements

### Requirement: Allowed file types
The system SHALL accept only these types: video (MP4, MOV, WebM), PDF, images (PNG, JPEG) and Word (DOCX). It SHALL decide the type from the file's real content, not from its name or the type the sender claims, and SHALL reject everything else.

#### Scenario: Valid file
- **WHEN** staff upload a real MP4, PDF, PNG, JPEG, WebM, MOV or DOCX within its size limit
- **THEN** the file is accepted and listed on the lesson with its detected type

#### Scenario: Wrong name or claimed type
- **WHEN** a program or script is uploaded named `lesson.pdf`, or a PDF is sent claiming to be an image
- **THEN** the upload is rejected with a 400 naming the file field and nothing is stored

#### Scenario: Not allowed types
- **WHEN** staff upload an executable, script, archive, web page, SVG image, macro-enabled Office file or any unlisted format
- **THEN** it is rejected with a message that lists the allowed formats

#### Scenario: Empty or broken file
- **WHEN** the file is empty or cut off before its signature can be read
- **THEN** it is rejected and nothing is stored

### Requirement: Size and count limits
Video files SHALL be at most 500 MB, PDF and Word files at most 50 MB, and images at most 10 MB, and a lesson SHALL hold at most 20 files. The size limit SHALL be enforced while the upload streams, so an oversized file is stopped without being stored in full.

#### Scenario: Too large
- **WHEN** a file passes its limit while uploading
- **THEN** the upload is stopped with a 413, partial data is removed, and no record exists

#### Scenario: Too many files
- **WHEN** a lesson already holds 20 files and another is uploaded
- **THEN** it is rejected with a clear message and nothing is stored

### Requirement: Who may manage files
Uploading, listing, renaming, changing the download switch on, and deleting a lesson's files SHALL require the lesson-upload permission for that course, held by Admins and Managers on every course and by an Instructor only where it was assigned to them for that course.

#### Scenario: Allowed
- **WHEN** an Admin, a Manager, or an Instructor with the grant on that course manages files
- **THEN** the request is allowed

#### Scenario: Not allowed
- **WHEN** an Instructor on another course or with no grant, a Student, or a signed-out caller tries
- **THEN** the response is 403 or 401 with the same body whether or not the course, lesson or file exists, and nothing is stored or changed

#### Scenario: Grant removed during an upload
- **WHEN** the grant is removed while a file is uploading
- **THEN** the file is not kept and no record is created

#### Scenario: Lesson of another course
- **WHEN** the lesson id belongs to a different course than the one in the address
- **THEN** the response is 404 for people who have access and nothing is stored

### Requirement: Safe storage
Files SHALL be stored under random names chosen by the server, never under the sender's file name, outside any web-served folder, with their size, detected type and SHA-256 recorded. The sender's file name SHALL be kept only as a cleaned display name of at most 120 characters.

#### Scenario: Hostile file name
- **WHEN** the file is named with path pieces, control characters or very long text
- **THEN** it is stored under a random name and shown with a cleaned display name, and nothing is written outside the storage folder

#### Scenario: Storage failure
- **WHEN** storing the file fails part way
- **THEN** no record remains and no partial file is left behind

### Requirement: Files are checked before they are served
Every new file SHALL start as pending and SHALL be served to nobody (not even staff for viewing by others) until a scan marks it clean. A file the scan rejects SHALL be removed and its record marked rejected with a reason.

#### Scenario: Clean file
- **WHEN** the scan passes
- **THEN** the file becomes available to those allowed to view it

#### Scenario: Rejected file
- **WHEN** the scan rejects a file
- **THEN** it is deleted from storage, listed to staff as rejected, and never served

#### Scenario: Placeholder scanner cannot ship
- **WHEN** the API starts in production configuration with the development scanner or development storage
- **THEN** it refuses to start with a clear message

### Requirement: Viewing links
A person who may view a file SHALL receive a short-lived signed link for it, valid for five minutes and only for that file, and the file endpoint SHALL accept only valid links. Links SHALL be issued only after the permission check at that moment.

#### Scenario: Staff view
- **WHEN** staff with lesson-upload permission on the course request a link for any clean file of its lessons
- **THEN** a link is returned and the file can be viewed with it

#### Scenario: Public preview
- **WHEN** anyone requests a link for a clean file of a Preview lesson on a published course
- **THEN** a link is returned

#### Scenario: Locked or hidden
- **WHEN** anyone requests a link for a file of a non-Preview lesson, a draft course, a pending or rejected file, or an unknown file
- **THEN** no link is issued (403 for locked lessons with a message that it is available after enrolling, 404 otherwise)

#### Scenario: Expired, altered or wrong file
- **WHEN** a link is expired, edited, or used for a different file
- **THEN** the response is 403 and no data is returned

#### Scenario: Preview turned off
- **WHEN** staff turn Preview off
- **THEN** new links for that lesson's files are refused at once (links already issued expire within five minutes)

### Requirement: Safe serving
File responses SHALL send the verified type, forbid the browser from guessing another type, carry a policy that disables scripts, forbid shared caching, support byte ranges so video can seek, and send Word files as downloads only.

#### Scenario: Range request
- **WHEN** a player asks for a byte range of a video
- **THEN** only that range is returned with the right headers

#### Scenario: Headers
- **WHEN** any file is served
- **THEN** the response has the verified content type, no-sniff, a sandbox policy and private caching

#### Scenario: Never as a web page
- **WHEN** a PDF or image contains script-like text
- **THEN** it is only ever returned as that file type and is never interpreted as a web page

### Requirement: Download switch
Each file SHALL have a "students can download" switch that is off by default. When off, the server SHALL serve the file for viewing only and the apps SHALL not offer a download action.

#### Scenario: Default
- **WHEN** a file is uploaded
- **THEN** downloading is off

#### Scenario: Turned on
- **WHEN** staff turn it on
- **THEN** the change is saved and audited and viewers are offered a download

### Requirement: Rename and delete
Staff SHALL be able to change a file's display name (3 to 120 characters) and delete a file, and deleting SHALL remove it from storage, end any use of its links and be audited.

#### Scenario: Delete
- **WHEN** staff delete a file
- **THEN** it disappears from the lesson, its stored data is removed, and links to it stop working

#### Scenario: Deleting a lesson or course content
- **WHEN** a lesson with files is deleted
- **THEN** its files are removed from storage in the same operation or by a retried cleanup that cannot leave a viewable orphan

### Requirement: Audit
Every upload, rename, download-switch change, delete and scan rejection SHALL write an audit record naming the actor, course, lesson and file ids, type and size, and SHALL NOT hold the file name's raw text beyond the cleaned display name nor any file content.

#### Scenario: Upload audited
- **WHEN** a file is accepted
- **THEN** one audit record exists with ids, detected type, size and hash

#### Scenario: Rejected upload
- **WHEN** an upload is rejected for type or size
- **THEN** a denied-style record names the actor and the reason, with no file content
