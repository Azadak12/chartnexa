# Spec Delta

## MODIFIED Requirements

### Requirement: Staff entry point
Profile SHALL show "Manage courses" only to people whose access includes managing courses, either through their role or through an Instructor grant, and the server SHALL still enforce permissions on every request.

#### Scenario: Staff
- **WHEN** an Admin or Manager opens Profile
- **THEN** Manage courses is shown

#### Scenario: Instructor with a grant
- **WHEN** an Instructor holding the create-course grant or at least one edit grant on a course opens Profile
- **THEN** Manage courses is shown

#### Scenario: Instructor without grants
- **WHEN** an Instructor with no grants opens Profile
- **THEN** it is not shown

#### Scenario: Student
- **WHEN** a Student opens Profile
- **THEN** it is not shown, and opening the staff route directly shows an access-denied state

## ADDED Requirements

### Requirement: Instructor scope in the app
For an Instructor, Manage courses SHALL list only their granted courses, SHALL show New course only with the create-course grant, and SHALL show Publish or Unpublish only on courses where they hold a publish grant. A refusal from the server SHALL show a plain "you no longer have access to this" message and return to the list.

#### Scenario: Grant limits the list
- **WHEN** an Instructor with grants on two courses opens Manage courses
- **THEN** exactly those two courses are listed, and when none apply a friendly empty state explains that access is given by an Admin or Manager

#### Scenario: Edit but not publish
- **WHEN** an Instructor with only an update grant opens that course
- **THEN** the form is editable and no publish control is shown

#### Scenario: Access removed while editing
- **WHEN** the Instructor's grant is revoked and they save
- **THEN** the app shows the access message, keeps the typed text visible, and offers Back
