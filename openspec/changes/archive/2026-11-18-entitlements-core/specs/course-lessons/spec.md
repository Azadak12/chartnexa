# Spec Delta

## MODIFIED Requirements

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
