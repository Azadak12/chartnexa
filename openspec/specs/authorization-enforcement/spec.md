# authorization-enforcement Specification

## Purpose
Defines how the server decides what an authenticated person may do, so no feature depends on hidden buttons or client-side checks for security.

## Requirements

### Requirement: Server-side permission checks
Protected endpoints SHALL declare the permission they need and the server SHALL verify it on every request from current database state, answering 401 when unauthenticated and 403 in the error envelope when the caller lacks the permission.

#### Scenario: Missing permission
- **WHEN** a signed-in user without the required permission calls a protected endpoint
- **THEN** the response is 403 with code FORBIDDEN and no data or side effects

#### Scenario: Not signed in
- **WHEN** an unauthenticated caller calls a protected endpoint
- **THEN** the response is 401, not 403

#### Scenario: Revocation takes effect immediately
- **WHEN** an Admin revokes a Manager's role and the Manager makes their next request with the same access token
- **THEN** the request is denied

### Requirement: Permission catalog and role defaults
The system SHALL define permissions in one catalog, give Admins all of them, give Managers an operational subset that excludes role management, audit reading and full payment data, and give Instructors and Students none by default.

#### Scenario: Instructor default
- **WHEN** a newly appointed Instructor requests any staff-only operation
- **THEN** it is denied until an explicit permission exists for it

#### Scenario: Manager limits
- **WHEN** a Manager tries to assign a role or read the audit trail
- **THEN** both are denied

#### Scenario: Manager payments
- **WHEN** permissions of a Manager are listed
- **THEN** payment status is included and full financial data is not

### Requirement: Resource-aware checks
The authorization check SHALL accept the resource being acted on (for example a course) so scoped permissions can be applied. A permission held through a role SHALL apply to every resource; a permission held through an Instructor grant SHALL apply only to the resource it was granted for. A scoped operation on a resource the caller has neither a role permission nor a grant for SHALL be denied.

#### Scenario: Unscoped role permission
- **WHEN** a Manager holding a course permission through their role acts on any course
- **THEN** the check passes

#### Scenario: No grant for the resource
- **WHEN** an Instructor with no grant acts on a course
- **THEN** the check fails

#### Scenario: Grant for this course
- **WHEN** an Instructor with an update grant on course A edits course A
- **THEN** the check passes

#### Scenario: Grant for another course
- **WHEN** the same Instructor edits course B
- **THEN** the check fails with 403

#### Scenario: Grants read from current state
- **WHEN** a grant is revoked and the Instructor repeats a request with the same access token
- **THEN** the request is denied

### Requirement: Own access is readable
A signed-in user SHALL be able to read their own roles, effective permissions and course grants, and the response SHALL be informational only, SHALL NOT be relied on for enforcement, and SHALL NOT include anything about other users.

#### Scenario: Read own access
- **WHEN** a signed-in user requests their access
- **THEN** the response lists their roles, permission identifiers and their own course grants, and nothing about other users

#### Scenario: Instructor with a create grant
- **WHEN** an Instructor holds the academy-wide create-course grant and requests their access
- **THEN** create course is listed among their permissions and course-specific grants are listed with their course ids

### Requirement: Staff lookup is minimal
Staff with the users-read permission SHALL be able to find an account by exact email and SHALL receive only its id, display name, role and status.

#### Scenario: Lookup by email
- **WHEN** a Manager looks up an exact email
- **THEN** the response contains id, display name, staff role and status, and no password data, sessions or tokens

#### Scenario: Partial match
- **WHEN** the email is only a fragment
- **THEN** no account is returned, so the endpoint cannot be used to browse users

#### Scenario: No permission
- **WHEN** an Instructor or Student calls the lookup
- **THEN** it is denied with 403
