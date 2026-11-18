# Spec Delta

## Purpose

Defines how staff create and maintain courses, so only authorized people change what students see and every change is traceable.

## ADDED Requirements

### Requirement: Create a draft course
The system SHALL let a person with the create-course permission create a course with a title, description, level, price in US cents and cover tone, and SHALL start it as a draft that students cannot see.

#### Scenario: Successful creation
- **WHEN** an Admin or Manager submits valid course details
- **THEN** a draft course is created, returned with its id and version, and an audit record is written

#### Scenario: Invalid details
- **WHEN** the title is shorter than 3 or longer than 120 characters, the description is over 5000 characters, the level or cover tone is unknown, or the price is negative, fractional or above 1,000,000 cents
- **THEN** the request is rejected with field-level errors and nothing is created

#### Scenario: Not permitted
- **WHEN** a Student, an Instructor without a permission, or a signed-out caller tries to create a course
- **THEN** the response is 403 or 401 and nothing is created

### Requirement: Edit a course without overwriting others
The system SHALL let a person with the update permission change a course's details, SHALL require the version they started from, and SHALL refuse the edit when the course has changed since.

#### Scenario: Successful edit
- **WHEN** staff submit changes with the current version
- **THEN** the course is updated, its version increases by one, and an audit record shows before and after values

#### Scenario: Stale edit
- **WHEN** staff submit changes based on an older version
- **THEN** the response is 409, nothing changes, and the message explains the course was changed elsewhere

#### Scenario: Simultaneous edits
- **WHEN** two edits with the same version arrive at the same moment
- **THEN** exactly one succeeds and the other receives 409

### Requirement: Publish and unpublish
The system SHALL let a person with the publish permission publish a draft that is complete and unpublish a published course, each recorded in the audit trail.

#### Scenario: Publish
- **WHEN** staff with the publish permission publish a draft with title, description, level and price set
- **THEN** it becomes published with a publish time and appears in the public catalog

#### Scenario: Incomplete draft
- **WHEN** a draft lacks a description
- **THEN** publishing is refused with a field-level reason and it stays a draft

#### Scenario: Unpublish
- **WHEN** staff unpublish a published course
- **THEN** it returns to draft and disappears from the public catalog immediately

#### Scenario: Permission separation
- **WHEN** a person who may edit but not publish tries to publish
- **THEN** the request is refused with 403

### Requirement: Staff can list and open every course
Staff with the update permission SHALL be able to list courses of every status, filter by status, page through them, and open any course.

#### Scenario: Mixed statuses
- **WHEN** staff list courses
- **THEN** drafts and published courses appear, newest change first, one page at a time

#### Scenario: Students cannot
- **WHEN** a Student or Instructor without permission requests the staff list
- **THEN** the response is 403
