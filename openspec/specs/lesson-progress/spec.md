# lesson-progress Specification

## Purpose
TBD - created by archiving change lesson-progress-basic. Update Purpose after archive.

## Requirements

### Requirement: Owners record their own completions
A signed-in person with an active entitlement to a course SHALL be able to mark any lesson of it complete and mark it not complete again. The server SHALL check the entitlement on every request.

#### Scenario: Mark complete
- **WHEN** an owner marks a lesson complete
- **THEN** one completion exists for that person and lesson, with the time it was made, and the response says it is complete

#### Scenario: Repeat and race
- **WHEN** the same mark is sent twice, or twice at the same moment
- **THEN** exactly one completion exists, both requests succeed, and the original completion time is kept

#### Scenario: Unmark
- **WHEN** an owner marks a completed lesson not complete
- **THEN** the completion is removed, repeating it changes nothing and still succeeds

#### Scenario: Not an owner
- **WHEN** a signed-out caller, or a signed-in person without an active entitlement, tries to mark or unmark
- **THEN** the response is 401 or 403 and nothing changes

#### Scenario: Revoked owner
- **WHEN** access is revoked and the same token marks a lesson
- **THEN** the response is 403 and nothing changes

#### Scenario: Wrong or missing lesson
- **WHEN** the lesson does not exist, or belongs to another course than the one in the path
- **THEN** the response is 404 and nothing changes

#### Scenario: Unpublished course
- **WHEN** an owner marks a lesson of a course that was unpublished
- **THEN** it works, because owners keep access

### Requirement: Progress is private to the person
A person SHALL be able to read only their own completions and progress. No endpoint SHALL return another person's.

#### Scenario: Own progress
- **WHEN** an owner asks for their progress on a course
- **THEN** they receive the ids and times of their completed lessons, the number complete, the number of lessons now in the course, and the next lesson

#### Scenario: Someone else's data
- **WHEN** another person asks about the same course
- **THEN** they see only their own progress (or 403 if they do not own it), never the first person's

### Requirement: Course progress is computed from what exists now
Progress SHALL be the number of completed lessons that still exist divided by the number of lessons in the course now. The next lesson SHALL be the first incomplete lesson by position, or none when all are complete or the course has no lessons.

#### Scenario: Lesson added later
- **WHEN** a course with 4 of 4 complete gets a fifth lesson
- **THEN** progress becomes 4 of 5 and the next lesson is the new one

#### Scenario: Lesson deleted
- **WHEN** a completed lesson is deleted
- **THEN** its completion disappears with it and the totals shrink by one, never going above the total

#### Scenario: Reordered lessons
- **WHEN** lessons are reordered
- **THEN** the next lesson follows the new order and completions stay with their lessons

#### Scenario: Empty course
- **WHEN** a course has no lessons
- **THEN** progress is 0 of 0 and there is no next lesson

### Requirement: My Courses carries progress without extra requests per course
Each item of the person's course list SHALL include its progress, computed for the whole page in a bounded number of queries.

#### Scenario: One page
- **WHEN** a person with 25 owned courses lists them
- **THEN** every item has complete and total counts, and the number of database queries does not grow with the number of courses

### Requirement: Access and account rules apply
Completions SHALL follow access: while access is revoked, progress is neither readable nor changeable; if access returns, earlier completions are readable again. Deleting an account SHALL delete the person's completions in the same transaction.

#### Scenario: Revoke then grant again
- **WHEN** access is revoked and later granted again
- **THEN** earlier completions are still present

#### Scenario: Account deletion
- **WHEN** an account is deleted
- **THEN** its completions are gone, other people's are untouched, and a failure of that step cancels the deletion

### Requirement: No personal data in logs
Progress writes SHALL log only ids and outcomes, never lesson text or contact details.

#### Scenario: Logs
- **WHEN** completions are marked and unmarked
- **THEN** the request logs contain no lesson text or email address
