# course-lessons Specification

## Purpose
Defines lessons inside a course: staff authoring and ordering, preview lessons, and who may read a lesson.

## Requirements

### Requirement: Lesson authoring is permission-checked per course
A lesson SHALL be created, edited, reordered or deleted only by someone who holds the lesson permission for that course (role default for Admin and Manager; a course grant for an Instructor). The server SHALL check this on every request.

#### Scenario: Manager adds a lesson
- **WHEN** a Manager adds a lesson with a valid title and body to a draft or published course
- **THEN** the lesson is saved at the end of the list and one audit record names the actor, course and lesson

#### Scenario: Student or signed-out caller
- **WHEN** a Student or a signed-out caller calls any staff lesson endpoint
- **THEN** the response is 403 or 401 and nothing changes

#### Scenario: Instructor without a grant
- **WHEN** an Instructor with no lesson grant on the course adds, edits, reorders or deletes a lesson
- **THEN** the response is 403, with the same body whether or not the course exists, and nothing changes

#### Scenario: Grant removed mid-session
- **WHEN** an Instructor's lesson grant is removed and they then send an edit with the same token
- **THEN** the edit is refused with 403

### Requirement: Lessons are validated
A lesson SHALL have a title of 1 to 120 characters after trimming and a body of 0 to 20,000 characters of plain text. A course SHALL hold at most 200 lessons.

#### Scenario: Invalid input
- **WHEN** the title is empty or too long, or the body is too long
- **THEN** the response is 400 with field errors (the API's existing validation response) and nothing is saved

#### Scenario: Limit reached
- **WHEN** a course already has 200 lessons and another is added
- **THEN** the response is 409 with code `LESSON_LIMIT_REACHED` and nothing is saved

#### Scenario: Plain text only
- **WHEN** a body contains markup such as HTML tags
- **THEN** it is stored as typed and always shown as text, never interpreted

### Requirement: Editing is protected against overwriting
Editing a lesson SHALL carry the version the editor saw; an edit based on an older version SHALL be refused with a conflict response and SHALL NOT change the lesson.

#### Scenario: Two editors
- **WHEN** two staff edit the same lesson from the same version at once
- **THEN** exactly one succeeds and the other receives 409 with the current version available to reload

### Requirement: Order is always a gapless sequence
Lessons in a course SHALL have positions 1 to N without gaps or duplicates after every operation, including concurrent ones.

#### Scenario: Concurrent adds
- **WHEN** two lessons are added to the same course at the same moment
- **THEN** both are saved with distinct consecutive positions

#### Scenario: Reorder
- **WHEN** staff submit the full list of the course's lesson ids in a new order
- **THEN** positions follow that order and the change is audited once

#### Scenario: Reorder with a stale list
- **WHEN** the submitted ids differ from the course's current lessons (one added, removed or unknown)
- **THEN** the response is 409 and the order is unchanged

#### Scenario: Delete closes the gap
- **WHEN** a lesson in the middle is deleted
- **THEN** later lessons move up by one and the deletion is audited

#### Scenario: Add racing a reorder
- **WHEN** an add and a reorder of the same course happen simultaneously
- **THEN** each either succeeds with a valid sequence or the reorder receives 409; no duplicate or missing position results

### Requirement: Lessons belong to their course
A lesson SHALL be reachable only through its own course, and SHALL be removed with no orphans if its course is ever removed.

#### Scenario: Wrong course in the path
- **WHEN** a lesson id is requested under a different course id
- **THEN** the response is 404

### Requirement: Staff can read lessons of courses they manage
Staff with the lesson permission SHALL list and read every lesson of that course, with bodies, in any course status.

#### Scenario: Draft course
- **WHEN** staff open the lessons of a draft course
- **THEN** all lessons and bodies are returned in order

### Requirement: Public reading is limited to the outline and previews
For a published course, anyone SHALL be able to read the outline (id, title, position, preview flag) and the body of lessons marked free preview. A signed-in person with an active entitlement to the course SHALL also be able to read the body of every lesson of it, including after the course is unpublished. Any other non-preview body SHALL be refused by the server.

#### Scenario: Outline
- **WHEN** anyone requests the lessons of a published course
- **THEN** titles, order and preview flags are returned and no bodies

#### Scenario: Preview body
- **WHEN** anyone opens a lesson marked free preview of a published course
- **THEN** its title and body are returned

#### Scenario: Locked body
- **WHEN** a signed-out caller, or a signed-in person without an active entitlement, opens a lesson not marked free preview
- **THEN** the response is 403 with a stable code meaning "enrollment required" and no body

#### Scenario: Draft course is invisible
- **WHEN** anyone without an active entitlement requests the outline or a lesson of a draft course
- **THEN** the response is 404, identical to a course that does not exist

#### Scenario: Unpublish hides lessons
- **WHEN** a course is unpublished
- **THEN** the outline and preview bodies become 404 immediately for everyone without an active entitlement

#### Scenario: Owner reads a locked lesson
- **WHEN** a signed-in student with an active entitlement opens a lesson not marked free preview
- **THEN** its title and body are returned

#### Scenario: Revoked owner
- **WHEN** an entitlement is revoked and the former owner opens a locked lesson
- **THEN** the response is 403 `ENROLLMENT_REQUIRED`

#### Scenario: Unpublished course, owner
- **WHEN** a course is unpublished and an owner opens one of its lessons or its outline
- **THEN** they are returned; anyone else still gets 404

#### Scenario: Bad or expired token
- **WHEN** the request carries an invalid or expired token on this public route
- **THEN** it is treated as signed out (preview lessons still open), not as a server error

### Requirement: Lesson changes are audited
Create, update, reorder and delete SHALL each write an audit record in the same transaction as the change, holding ids and the names of changed fields, never the body text.

#### Scenario: Atomic audit
- **WHEN** the audit write fails
- **THEN** the lesson change is rolled back

#### Scenario: Body not logged
- **WHEN** a lesson body is edited
- **THEN** the audit record lists that the body changed but does not contain it

### Requirement: Retries do not duplicate
Adding a lesson SHALL accept a client-generated idempotency key so a retried request after a lost response does not create a second lesson.

#### Scenario: Repeated add
- **WHEN** the same add (same key, same course) is sent twice
- **THEN** one lesson exists and both responses return it
