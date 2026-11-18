# Spec Delta

## Purpose
Defines how a course's lessons are created, ordered, changed and removed by authorized staff, and what the public may read of them, so course content is traceable and never exposed beyond what is allowed.

## ADDED Requirements

### Requirement: Lesson details
A lesson SHALL belong to one course and have a title of 3 to 120 characters, plain-text content of 0 to 20000 characters, a position in the course, a preview flag that starts off, and a version that starts at 1. A course SHALL hold at most 200 lessons.

#### Scenario: Valid lesson
- **WHEN** staff create a lesson with a valid title and content
- **THEN** it is added at the end of the course, returned with its id, position, version and preview flag, and audited

#### Scenario: Invalid details
- **WHEN** the title is shorter than 3 or longer than 120 characters, or the content is over 20000 characters
- **THEN** the request is rejected with field-level errors and nothing is created

#### Scenario: Too many lessons
- **WHEN** a course already has 200 lessons and another is added
- **THEN** the request is rejected with a clear message and nothing is created

#### Scenario: Content is plain text
- **WHEN** content contains markup such as angle brackets
- **THEN** it is stored and returned exactly as typed and is never interpreted

### Requirement: Who may manage lessons
Creating, listing, reading, editing, deleting and reordering a course's lessons as staff SHALL require the lesson-upload permission for that course: Admins and Managers hold it for every course, an Instructor only where it was granted for that course.

#### Scenario: Manager
- **WHEN** a Manager manages lessons on any course
- **THEN** the request is allowed

#### Scenario: Instructor with a grant
- **WHEN** an Instructor with the lesson-upload grant on course A manages lessons on A
- **THEN** the request is allowed

#### Scenario: Instructor on another course or without a grant
- **WHEN** that Instructor acts on course B, or an Instructor with no grant acts on any course
- **THEN** the response is 403 with the same body whether or not the course exists, and nothing changes

#### Scenario: Student or signed out
- **WHEN** a Student or a signed-out caller calls a staff lesson endpoint
- **THEN** the response is 403 or 401 and nothing is revealed

#### Scenario: Revoked mid-session
- **WHEN** the grant is removed and the Instructor repeats a request with the same access token
- **THEN** the request is denied

### Requirement: Order is always complete
Lessons SHALL have positions 1 to N with no gaps or duplicates after every change. Reordering SHALL take the complete list of the course's lesson ids and SHALL be refused if the list is missing a lesson, repeats one, or contains one from another course.

#### Scenario: Reorder
- **WHEN** staff send all lesson ids in a new order
- **THEN** the lessons take exactly that order and one audit record is written

#### Scenario: Incomplete or foreign list
- **WHEN** the list omits a lesson, repeats an id, or includes an unknown or other-course id
- **THEN** it is rejected with a 400 and the order is unchanged

#### Scenario: Delete closes the gap
- **WHEN** a lesson in the middle is deleted
- **THEN** the lessons after it move up by one and no position is missing

#### Scenario: Simultaneous changes
- **WHEN** two staff reorder, or one reorders while another adds or deletes, at the same moment
- **THEN** the results are applied one after the other, positions stay complete, and a reorder built on an outdated list is rejected with a conflict

### Requirement: Edit without overwriting others
Editing a lesson SHALL require the version the person started from and SHALL be refused with a conflict when the lesson has changed since.

#### Scenario: Simultaneous edits
- **WHEN** two people edit the same lesson from the same version
- **THEN** exactly one edit succeeds and the other receives the conflict response with nothing lost

#### Scenario: Preview switch
- **WHEN** staff turn Preview on or off in an edit
- **THEN** the change is saved with the new version and audited with the old and new values

### Requirement: Audit
Every lesson create, edit, delete and reorder SHALL write an audit record in the same transaction, naming the actor, the course and the lesson ids, and SHALL NOT hold lesson content.

#### Scenario: Atomic
- **WHEN** a change fails after partly running
- **THEN** neither the change nor its audit record exists

#### Scenario: No content in audit
- **WHEN** an edit is audited
- **THEN** the record names which fields changed and holds no lesson text

### Requirement: Public lesson list
Anyone SHALL be able to list the lessons of a published course in order, receiving only id, title, position and preview flag, and the list of a draft or unknown course SHALL answer 404.

#### Scenario: Published course
- **WHEN** anyone lists lessons of a published course
- **THEN** titles appear in order with their preview flags and no content

#### Scenario: Draft course
- **WHEN** anyone lists lessons of a draft or unknown course
- **THEN** the response is 404

#### Scenario: Unpublished later
- **WHEN** a course is unpublished
- **THEN** its lesson list answers 404 from the next request

### Requirement: Public lesson reading
Anyone SHALL be able to read the content of a preview lesson of a published course. Other lessons SHALL NOT return content to the public: the response is 403 with a message that the lesson is available after enrolling.

#### Scenario: Preview lesson
- **WHEN** anyone opens a preview lesson of a published course
- **THEN** its title and content are returned

#### Scenario: Locked lesson
- **WHEN** anyone opens a non-preview lesson
- **THEN** the response is 403, no content is returned, and the message says it is available after enrolling

#### Scenario: Wrong course, draft or unknown
- **WHEN** the lesson id does not belong to that course, or the course is a draft
- **THEN** the response is 404

#### Scenario: Preview turned off
- **WHEN** staff turn Preview off
- **THEN** the lesson stops returning content on the next request

### Requirement: Safe reading of content
Public responses SHALL carry lesson text only as data with the lesson's own title and content, no staff fields, and no ids of people.

#### Scenario: Shape
- **WHEN** a preview lesson is returned
- **THEN** it contains only id, course id, title, content, position and preview flag
