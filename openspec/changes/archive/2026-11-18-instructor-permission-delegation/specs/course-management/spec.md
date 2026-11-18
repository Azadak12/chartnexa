# Spec Delta

## MODIFIED Requirements

### Requirement: Staff can list and open every course
Staff whose role carries the update permission SHALL be able to list courses of every status, filter by status, page through them, and open any course. An Instructor SHALL be able to list, page through and open only the courses on which they hold an update grant, and SHALL receive 403 for a course they hold no update grant on.

#### Scenario: Mixed statuses
- **WHEN** staff list courses
- **THEN** drafts and published courses appear, newest change first, one page at a time

#### Scenario: Students cannot
- **WHEN** a Student or an Instructor with no grants requests the staff list
- **THEN** the response is 403

#### Scenario: Instructor sees only granted courses
- **WHEN** an Instructor with update grants on courses A and C lists courses while B also exists
- **THEN** only A and C appear, and paging stays stable when other courses are added meanwhile

#### Scenario: Opening an ungranted course
- **WHEN** that Instructor opens course B directly by id
- **THEN** the response is 403, with the same body whether B exists or not

## ADDED Requirements

### Requirement: Instructor editing and publishing follow grants
An Instructor SHALL be able to edit a course only with an update grant on it, and publish or unpublish it only with a publish grant on it, and an Instructor SHALL be able to create a course only with the academy-wide create-course grant.

#### Scenario: Edit with grant
- **WHEN** an Instructor with an update grant sends an edit with the current version
- **THEN** the edit is saved and audited with the Instructor as actor

#### Scenario: Publish without grant
- **WHEN** an Instructor with only an update grant publishes the course
- **THEN** the response is 403 and the course stays a draft

#### Scenario: Create without grant
- **WHEN** an Instructor with no create-course grant creates a course
- **THEN** the response is 403 and nothing is created

#### Scenario: Stale edit still protected
- **WHEN** an Instructor and a Manager edit the same course from the same version
- **THEN** one edit succeeds and the other receives the conflict response
