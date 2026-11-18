# Spec Delta

## MODIFIED Requirements

### Requirement: Public reading is limited to the outline and previews
For a published course, anyone SHALL be able to read the outline (id, title, position, preview flag) and the body of lessons marked free preview. A signed-in person with an active entitlement to the course SHALL also be able to read the body of every lesson of it, including after the course is unpublished. Any other non-preview body SHALL be refused by the server.

#### Scenario: Owner reads a locked lesson
- **WHEN** a signed-in student with an active entitlement opens a lesson not marked free preview
- **THEN** its title and body are returned

#### Scenario: Not an owner
- **WHEN** a signed-in student without an entitlement, or a signed-out caller, opens such a lesson
- **THEN** the response is 403 with code `ENROLLMENT_REQUIRED` and no body

#### Scenario: Revoked owner
- **WHEN** an entitlement is revoked and the former owner opens a locked lesson
- **THEN** the response is 403 `ENROLLMENT_REQUIRED`

#### Scenario: Unpublished course, owner
- **WHEN** a course is unpublished and an owner opens one of its lessons or its outline
- **THEN** they are returned; anyone else still gets 404

#### Scenario: Bad or expired token
- **WHEN** the request carries an invalid or expired token on this public route
- **THEN** it is treated as signed out (preview lessons still open), not as a server error
