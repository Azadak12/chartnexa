# Spec Delta

## ADDED Requirements

### Requirement: One active entitlement per person and course
The system SHALL keep at most one active entitlement for a person and a course, enforced by the database as well as the API.

#### Scenario: Grant once
- **WHEN** staff grant a course to a student who does not own it
- **THEN** one active entitlement with source `admin_grant`, the reason and the granting staff member is created and audited

#### Scenario: Grant again
- **WHEN** staff grant a course the student already owns
- **THEN** nothing new is created, the response says it already existed, and no second audit record is written

#### Scenario: Simultaneous grants
- **WHEN** two staff grant the same course to the same student at the same moment
- **THEN** exactly one active entitlement exists afterwards and both requests succeed

#### Scenario: Grant after revoke
- **WHEN** a revoked entitlement is granted again
- **THEN** a new active entitlement is created and the revoked one stays as history

### Requirement: Only enrollment managers grant and revoke
Granting, revoking and listing a course's students SHALL require `enrollments:manage`, checked on every request.

#### Scenario: Not allowed
- **WHEN** a Student, an Instructor (with any grants) or a signed-out caller calls these endpoints
- **THEN** the response is 403 or 401 and nothing changes

#### Scenario: Eligible students only
- **WHEN** staff grant a course to an account that does not exist, is disabled, or has an unverified email
- **THEN** the response is a clear error (404 for unknown, 409 for ineligible) and nothing is created; the response never reveals more about the account than whether it can be granted

#### Scenario: Unknown course
- **WHEN** the course does not exist
- **THEN** the response is 404

### Requirement: Revoking ends access immediately and is audited
Revoking SHALL need a reason of 3 to 200 characters, end the entitlement in the same transaction as its audit record, and take effect on the next request with the same token.

#### Scenario: Revoke
- **WHEN** staff revoke an active entitlement
- **THEN** it becomes revoked with who, when and why, and the student can no longer read locked lessons

#### Scenario: Double revoke
- **WHEN** an entitlement is revoked twice
- **THEN** the second request changes nothing and writes no audit record

#### Scenario: Revoke racing a grant
- **WHEN** a revoke and a grant of the same course and student happen simultaneously
- **THEN** the end state is either one active entitlement or none, never two, and the audit trail matches it

### Requirement: Access always reads the database
Whether a person may read a lesson SHALL be decided from the database on every request. No cached or token-embedded value SHALL grant access.

#### Scenario: Token issued before the grant
- **WHEN** a student's session started before the grant and they open a locked lesson after it
- **THEN** the lesson opens

#### Scenario: Token issued before the revoke
- **WHEN** access is revoked and the same token opens a locked lesson
- **THEN** the response is 403 `ENROLLMENT_REQUIRED`

### Requirement: Students list their own courses
A signed-in person SHALL be able to list their own active entitlements, newest grant first, one page at a time, and nobody else's.

#### Scenario: My Courses
- **WHEN** a student with two entitlements lists their courses
- **THEN** both appear with public course fields and when access began, and no staff-only fields or other people's data

#### Scenario: Revoked and none
- **WHEN** an entitlement is revoked, or the student has none
- **THEN** it does not appear, and an empty page is returned

#### Scenario: Unpublished course
- **WHEN** an owned course is unpublished
- **THEN** it still appears, marked as not currently on sale, and its lessons stay readable

### Requirement: Staff list who has access to a course
Staff with `enrollments:manage` SHALL list a course's active entitlements one page at a time, showing display name or email only to them, never in audit rows.

#### Scenario: Paging
- **WHEN** a course has more people than one page
- **THEN** paging is stable while people are added or removed meanwhile

### Requirement: Entitlement changes are audited without personal data
Grant and revoke SHALL each write one audit record in the same transaction, holding ids, source and reason, never an email address.

#### Scenario: Atomic
- **WHEN** the audit write fails
- **THEN** the entitlement change is rolled back
