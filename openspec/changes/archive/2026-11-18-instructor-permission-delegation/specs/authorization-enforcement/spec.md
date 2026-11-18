# Spec Delta

## MODIFIED Requirements

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
