# mobile-course-management Specification

## Purpose
Defines the staff screens for creating and publishing courses in the app.

## Requirements

### Requirement: Staff entry point
Profile SHALL show "Manage courses" only to people whose access includes managing courses, and the server SHALL still enforce permissions on every request.

#### Scenario: Staff
- **WHEN** an Admin or Manager opens Profile
- **THEN** Manage courses is shown

#### Scenario: Student
- **WHEN** a Student opens Profile
- **THEN** it is not shown, and opening the staff route directly shows an access-denied state

### Requirement: Course list with status
Staff SHALL see all courses with a text status of Draft or Published, filter by status, and open one to edit.

#### Scenario: Mixed list
- **WHEN** staff open Manage courses
- **THEN** each course shows its status as text, not color alone

### Requirement: Create and edit
Staff SHALL create and edit a course in a form with clear labels, price entered in dollars, level and cover choices, field errors beside fields, and protection against double submit.

#### Scenario: Create
- **WHEN** staff fill valid details and save
- **THEN** a draft is created and shown in the list

#### Scenario: Validation
- **WHEN** a field is invalid
- **THEN** the reason appears beside it and typed values are kept

#### Scenario: Price entry
- **WHEN** staff enter 49.5
- **THEN** it is saved as $49.50 and an entry with more than two decimals is rejected

#### Scenario: Stale edit
- **WHEN** the course was changed elsewhere
- **THEN** a message explains and offers to reload the latest version without losing the typed text

### Requirement: Publish and unpublish with confirmation
Staff SHALL publish and unpublish through a confirmation that states what students will see.

#### Scenario: Publish
- **WHEN** staff confirm publishing a complete draft
- **THEN** the course shows as Published and appears for students

#### Scenario: Cancel
- **WHEN** staff cancel or press back on the confirmation
- **THEN** nothing changes

#### Scenario: Incomplete draft
- **WHEN** the server refuses because details are missing
- **THEN** the reason is shown beside the field
