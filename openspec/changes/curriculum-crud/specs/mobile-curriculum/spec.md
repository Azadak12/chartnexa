# Spec Delta

## Purpose
Defines the app screens for building a curriculum and for showing it to students.

## ADDED Requirements

### Requirement: Staff curriculum screen
The app SHALL give staff who may update a course a Curriculum screen, opened from that course, listing modules with their lessons. Adding and renaming SHALL use sheets; reordering SHALL use explicit move up and move down controls with announced results; deleting SHALL ask for confirmation that states what will be removed.

#### Scenario: Build
- **WHEN** staff add a module, add a lesson and move it up
- **THEN** the list updates, focus returns to the control that opened each sheet, and back returns to the course

#### Scenario: Reload needed
- **WHEN** the server answers 409 for an outdated list or version
- **THEN** a message offers to reload, the screen shows the current order, and the user's typed text is kept

#### Scenario: Unauthorized
- **WHEN** the server answers 403
- **THEN** a clear no-permission state is shown and no stale data stays visible

#### Scenario: States
- **WHEN** the screen is loading, empty, offline or failing
- **THEN** it shows a skeleton, an empty state with an Add action, an offline banner, or an error with Retry

### Requirement: Student outline
The student course page SHALL show the outline: module titles with their lesson titles and kinds, and counts. Lessons SHALL NOT be openable yet.

#### Scenario: Outline shown
- **WHEN** a student opens a published course
- **THEN** modules and lessons appear in order, readable at large text sizes and labelled for screen readers

#### Scenario: Empty outline
- **WHEN** a published course somehow has no lessons
- **THEN** the page says content is coming and does not fail
