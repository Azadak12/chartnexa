# Spec Delta

## Purpose
Defines how an Instructor receives, holds and loses individual permissions, who may hand out which permission, and how every change is recorded and enforced on the server.

## ADDED Requirements

### Requirement: Grantable permissions
The system SHALL allow only these permissions to be granted to an Instructor: create course (academy-wide), and update course, publish course, upload lessons, schedule live sessions, read students and read reports (each for one named course). Every other permission SHALL be refused as not grantable, whoever asks.

#### Scenario: Course permission without a course
- **WHEN** a grant for update course is submitted without a course
- **THEN** it is rejected with a 400 naming the course field

#### Scenario: Create course for one course
- **WHEN** a grant for create course names a course
- **THEN** it is rejected with a 400, because create course applies to the whole academy

#### Scenario: Not grantable
- **WHEN** someone tries to grant role management, audit reading, user lookup, enrollments, review moderation, payment data or instructor-permission management
- **THEN** the request is rejected with a 400 and nothing is granted

### Requirement: Who may grant
Admins SHALL be able to grant any grantable permission. Managers with the manage-instructor-permissions permission SHALL be able to grant any grantable permission except publish course. Students, Instructors and signed-out callers SHALL be refused.

#### Scenario: Admin grants publishing
- **WHEN** an Admin grants publish course on a course to an Instructor with a reason
- **THEN** the grant exists and an audit record is written

#### Scenario: Manager exceeds the ceiling
- **WHEN** a Manager tries to grant publish course
- **THEN** the response is 403, nothing is granted, and the denied attempt is audited

#### Scenario: Instructor or Student tries
- **WHEN** an Instructor or Student calls any grant endpoint
- **THEN** the response is 403 and the attempt is audited as denied

#### Scenario: Not signed in
- **WHEN** a signed-out caller calls a grant endpoint
- **THEN** the response is 401

### Requirement: Grants go only to active Instructors
A grant SHALL be accepted only for an active account that currently holds the Instructor role, and for course permissions only on an existing course.

#### Scenario: Target is not an Instructor
- **WHEN** the target is a Student, Manager, Admin, disabled, deleted or unknown account
- **THEN** the grant is rejected and nothing changes

#### Scenario: Unknown course
- **WHEN** the named course does not exist
- **THEN** the grant is rejected with a 404

#### Scenario: Nobody grants to themselves
- **WHEN** a caller targets their own account
- **THEN** the request is rejected and audited as denied

### Requirement: Reason, audit and idempotency
Every grant and revoke SHALL require a reason of 3 to 200 characters and SHALL write an audit record in the same transaction. Granting a permission the Instructor already holds for the same scope SHALL change nothing and write no new grant.

#### Scenario: Missing reason
- **WHEN** a grant or revoke has no reason
- **THEN** it is rejected with a 400 naming the reason field

#### Scenario: Repeated grant
- **WHEN** the same grant is submitted twice, including at the same moment
- **THEN** exactly one active grant exists and both calls succeed

#### Scenario: Audit content
- **WHEN** a grant is made or revoked
- **THEN** the audit record names the actor, the Instructor, the permission, the course and the reason, and holds no email or secret

### Requirement: Revoking takes effect immediately
Revoking a grant SHALL end that permission for the Instructor on their very next request, even with the same access token, and SHALL leave the grant in the history.

#### Scenario: Revoke then use
- **WHEN** an Admin revokes an Instructor's update grant and the Instructor edits that course with the same token
- **THEN** the edit is refused with 403

#### Scenario: Revoking twice
- **WHEN** a grant that is already revoked is revoked again
- **THEN** the response is a clear not-found or already-ended error and nothing else changes

### Requirement: Grants apply only where granted
A course grant SHALL allow its permission only on the named course, and SHALL NOT allow the Instructor to act on any other course or to use other permissions.

#### Scenario: Another course
- **WHEN** an Instructor with an update grant on course A edits course B
- **THEN** the response is 403 and course B is unchanged

#### Scenario: Update is not publish
- **WHEN** an Instructor with only an update grant tries to publish that course
- **THEN** the response is 403

### Requirement: Grants end with the role
Grants SHALL stop working when the Instructor role ends, the account is disabled or deleted, or the person becomes a Manager or Admin, and the role change SHALL end the grants in the same transaction with an audit record.

#### Scenario: Instructor becomes Manager
- **WHEN** an Admin changes an Instructor to a Manager
- **THEN** the Instructor's grants are ended, and one change is audited

#### Scenario: Reappointed later
- **WHEN** the same person is appointed Instructor again
- **THEN** they hold no grants until new ones are made

#### Scenario: Disabled account
- **WHEN** an Instructor's account is disabled
- **THEN** none of their grants take effect while it is disabled

### Requirement: Creating a course as an Instructor
An Instructor who holds the create-course permission and creates a course SHALL automatically receive update, upload lessons, schedule live, read students and read reports on that course, SHALL NOT receive publish, and the automatic grants SHALL be audited as system-made and revocable.

#### Scenario: Instructor creates a draft
- **WHEN** an Instructor with create-course creates a course
- **THEN** they can open and edit it and cannot publish it, and the creation and grants are audited

#### Scenario: Revoking an automatic grant
- **WHEN** an Admin revokes the automatic update grant
- **THEN** the Instructor can no longer edit that course

### Requirement: List and read grants
People allowed to manage Instructor permissions SHALL be able to see an Instructor's active grants (permission, course id and title, who granted, when, reason) and which permissions the caller may grant.

#### Scenario: Manager lists
- **WHEN** a Manager opens an Instructor's permissions
- **THEN** active grants are shown, and publish course is marked as not grantable by this caller

#### Scenario: Unknown person
- **WHEN** the id is not an account or not an Instructor
- **THEN** the response is 404

#### Scenario: Minimal data
- **WHEN** grants are listed
- **THEN** no email, password data, sessions or tokens are returned
