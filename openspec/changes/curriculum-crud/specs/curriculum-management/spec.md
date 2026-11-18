# Spec Delta

## Purpose
Defines how a course's modules and lessons are created, changed, ordered and shown, and who may do it.

## ADDED Requirements

### Requirement: Structure a course
The system SHALL let a caller holding the update-course permission for a course create, rename, describe and delete modules and lessons of that course. A module belongs to one course and a lesson to one module. Titles SHALL be 1 to 120 characters, descriptions at most 500, a course at most 50 modules and a module at most 100 lessons. A lesson kind SHALL be video, document or live.

#### Scenario: Add a module and a lesson
- **WHEN** an authorized caller adds a module and then a lesson to it
- **THEN** both exist at the end of their lists and an audit record names the actor, the course and the item

#### Scenario: Invalid input
- **WHEN** a title is empty or too long, the kind is unknown, or a limit would be exceeded
- **THEN** the request is rejected with a 400 naming the field and nothing changes

#### Scenario: Delete a module
- **WHEN** a module with lessons is deleted
- **THEN** its lessons are deleted with it, the remaining modules keep their order without gaps, and one audit record states how many lessons went

### Requirement: Only authorized staff, only their course
Every curriculum write and every staff read of a draft outline SHALL be checked on the server against the update-course permission for that specific course. Students, signed-out callers and staff without the permission SHALL be refused.

#### Scenario: Unauthorized
- **WHEN** a Student or Instructor without a grant calls any curriculum write
- **THEN** the response is 403, nothing changes and the attempt is audited as denied

#### Scenario: Signed out
- **WHEN** a signed-out caller calls a curriculum write
- **THEN** the response is 401

#### Scenario: Wrong course
- **WHEN** a module id from course A is used under course B
- **THEN** the response is 404 and nothing changes

### Requirement: Ordering is safe
Reordering SHALL take the full ordered list of ids for the course's modules, or for one module's lessons, and SHALL apply it atomically. Positions SHALL always be unique and gap-free within their parent.

#### Scenario: Reorder
- **WHEN** an authorized caller submits the complete list in a new order
- **THEN** the new order is stored and returned

#### Scenario: Outdated list
- **WHEN** the submitted list is missing an id, contains an unknown or duplicate id, or does not match the current set
- **THEN** the response is 409 with a message to reload, and nothing changes

#### Scenario: Concurrent reorders
- **WHEN** two reorders of the same parent arrive together
- **THEN** they apply one after the other, the final order is exactly one of the two submitted lists, and no position is duplicated or lost

#### Scenario: Concurrent add and delete
- **WHEN** a module is added while another is deleted
- **THEN** positions stay unique and gap-free

### Requirement: Edits do not overwrite each other
Renaming or describing a module or lesson SHALL require the version the caller started from, and SHALL be refused when it is out of date.

#### Scenario: Stale edit
- **WHEN** an edit is based on an older version
- **THEN** the response is 409 with a message to reload, and the newer text is kept

### Requirement: Public outline
The public detail of a published course SHALL include its modules and lessons in order, showing only ids, titles, kinds and counts. Drafts SHALL never expose an outline publicly.

#### Scenario: Published outline
- **WHEN** anyone opens a published course
- **THEN** the outline is shown in order with no descriptions of lesson content, files or links

#### Scenario: Draft course
- **WHEN** anyone but authorized staff asks for a draft's outline
- **THEN** the response is 404

## MODIFIED Requirements

### Requirement: Publishing needs a curriculum
(`course-management`) Publishing a course SHALL be refused unless it has at least one module containing at least one lesson.

#### Scenario: Empty course
- **WHEN** staff publish a course with no lessons
- **THEN** the response is 409 saying a lesson is needed, and the course stays a draft

#### Scenario: Emptied after publishing
- **WHEN** the last lesson of a published course is deleted
- **THEN** the deletion is refused with 409 until the course is unpublished
