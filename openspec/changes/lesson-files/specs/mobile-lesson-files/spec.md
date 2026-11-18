# Spec Delta

## Purpose
Defines how staff pick, upload, manage and how people view lesson files in the app, including progress, failure and recovery on a phone.

## ADDED Requirements

### Requirement: Files on the staff lesson screen
For people allowed to manage a lesson, the lesson screen SHALL list its files with display name, type, size and status (Checking, Ready or Rejected) in text, and SHALL offer Add file, Rename, a Students can download switch and Delete.

#### Scenario: Listing
- **WHEN** staff open a lesson with files
- **THEN** each file shows name, type, size and status as text

#### Scenario: No permission
- **WHEN** a person without the permission opens the screen
- **THEN** an access-denied state is shown and no file data is requested

### Requirement: Pick and upload
Add file SHALL let staff choose a file from the phone, SHALL show the allowed formats and limits before choosing, SHALL refuse a wrong type or an oversized file before sending, and SHALL show upload progress with a Cancel button.

#### Scenario: Successful upload
- **WHEN** staff choose a valid file and the upload finishes
- **THEN** the file appears in the list as Checking, then Ready when the server has cleared it

#### Scenario: Refused before sending
- **WHEN** the chosen file is too large or an unlisted type
- **THEN** a plain message explains the limit and nothing is uploaded

#### Scenario: Cancel
- **WHEN** staff press Cancel during an upload
- **THEN** the upload stops and no file is left in the list

#### Scenario: Connection lost
- **WHEN** the connection drops during an upload
- **THEN** the app says it failed, keeps nothing half-uploaded in the list, and offers Try again

#### Scenario: Server refuses
- **WHEN** the server answers 400, 403, 413 or 429
- **THEN** a plain message explains the reason and the chosen file name stays visible so staff know what failed

#### Scenario: Leaving during upload
- **WHEN** staff press back during an upload
- **THEN** the app asks before leaving and cancelling the upload

### Requirement: Manage files
Rename SHALL use a short sheet, Delete SHALL ask for confirmation naming the file, and the download switch SHALL save at once with a visible result.

#### Scenario: Delete
- **WHEN** staff confirm deleting a file
- **THEN** it disappears; cancel or back changes nothing

#### Scenario: Double tap and failures
- **WHEN** a button is pressed twice or the server answers 403 or 404
- **THEN** only one request is sent and a plain message with a way to retry or go back is shown

### Requirement: Viewing files in a lesson
The lesson reader SHALL list a Preview lesson's ready files and let anyone view them: images shown in the app, video played in the app with the usual controls, and PDF and Word files opened in the phone's own viewer. Download SHALL be offered only for files with the switch on.

#### Scenario: Image
- **WHEN** a person opens an image
- **THEN** it is shown in the app with a text description of the file name

#### Scenario: Video
- **WHEN** a person opens a video
- **THEN** it plays with play, pause and seek controls, and if the link expired the app asks for a fresh one without showing an error

#### Scenario: PDF or Word
- **WHEN** a person opens a PDF or Word file
- **THEN** it opens in the phone's viewer or share sheet

#### Scenario: Locked lesson
- **WHEN** the lesson is not a preview
- **THEN** its files are not listed to students and the lesson shows the existing Locked message

#### Scenario: File removed or no longer available
- **WHEN** the file was deleted or Preview was turned off since the list loaded
- **THEN** a plain message explains it and offers Back

### Requirement: Accessible file screens
All controls SHALL have text names, 44-point targets, announce progress and results, and work at the largest text size; video SHALL expose accessible play and pause controls.

#### Scenario: Upload progress announced
- **WHEN** an upload runs with a screen reader on
- **THEN** progress and the final result are announced as text
