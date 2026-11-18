# mobile-instructor-permissions Specification

## Purpose
Defines the app screens where authorized staff find an Instructor, see and change their permissions, and where Admins appoint or remove the Instructor role.

## Requirements

### Requirement: Entry point
Profile SHALL show "Instructor permissions" only to people whose access includes managing Instructor permissions, and the server SHALL still enforce permissions on every request.

#### Scenario: Admin or Manager
- **WHEN** an Admin or Manager opens Profile
- **THEN** Instructor permissions is shown

#### Scenario: Instructor or Student
- **WHEN** an Instructor or Student opens Profile
- **THEN** it is not shown, and opening the route directly shows an access-denied state

### Requirement: Find a person
The screen SHALL let staff find a person by exact email and SHALL show only their display name, role and status.

#### Scenario: Found Instructor
- **WHEN** the email belongs to an active Instructor
- **THEN** the person's grants and an Add permission action are shown

#### Scenario: Found but not an Instructor
- **WHEN** the email belongs to someone else
- **THEN** the screen says they are not an Instructor, and an Admin sees an action to make them one

#### Scenario: Not found or invalid
- **WHEN** no account matches or the email is malformed
- **THEN** a plain message appears next to the field, with no hint about whether other emails exist

#### Scenario: Loading and failure
- **WHEN** the lookup is running or fails
- **THEN** a loading state or an error with Retry is shown

### Requirement: Add and remove permissions
The screen SHALL list each grant with its permission name in words, its course title where it applies, and a Remove action. Adding SHALL ask for the permission, the course where the permission needs one, and a reason, in a sheet. Removing SHALL ask for confirmation and a reason.

#### Scenario: Add a course permission
- **WHEN** staff choose "Edit course details", pick a course, enter a reason and confirm
- **THEN** the sheet closes, the new grant appears in the list, and a success message is announced

#### Scenario: Manager and publishing
- **WHEN** a Manager opens the Add sheet
- **THEN** Publish course is shown as not available to them, with a short explanation, and cannot be chosen

#### Scenario: Missing reason or course
- **WHEN** the form is submitted without a reason, or without a course for a course permission
- **THEN** the field shows an error and nothing is sent

#### Scenario: Remove
- **WHEN** staff confirm removing a grant with a reason
- **THEN** it disappears from the list; cancelling or going back changes nothing

#### Scenario: Double tap and failures
- **WHEN** the confirm button is pressed twice, or the server refuses with 403, 404 or a network error
- **THEN** only one request is sent, and the refusal or error is shown with a way to retry or go back

### Requirement: Appoint and remove the Instructor role
For Admins only, the screen SHALL let them make an active, verified person an Instructor with a reason, and remove the Instructor role with confirmation and a reason.

#### Scenario: Admin appoints
- **WHEN** an Admin finds a Student by email and confirms Make Instructor with a reason
- **THEN** the person is shown as an Instructor with no permissions yet

#### Scenario: Manager
- **WHEN** a Manager views a person who is not an Instructor
- **THEN** no role action is shown

#### Scenario: Refusals shown
- **WHEN** the server refuses because the person is not eligible or the caller is not an Admin
- **THEN** a plain message explains it and nothing in the list changes

### Requirement: Accessible and recoverable
All controls SHALL have text labels and at least 44-point touch targets, announce state changes, restore focus when a sheet closes, and keep what the person typed after a failed request.

#### Scenario: Sheet closes
- **WHEN** a sheet is cancelled or completed
- **THEN** focus returns to the control that opened it

#### Scenario: Failed save
- **WHEN** an add or remove request fails
- **THEN** the typed reason is still in the field
