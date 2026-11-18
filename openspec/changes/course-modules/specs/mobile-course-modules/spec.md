# Spec Delta

## ADDED Requirements

### Requirement: Students see module headings
The course page SHALL show "Module N: title" as a heading above each module's lessons.

#### Scenario: Headings
- **WHEN** a course has modules
- **THEN** each module's lessons appear under its heading, which screen readers announce as a header

### Requirement: Staff manage modules on the Lessons screen
The staff Lessons screen SHALL list modules with rename, move up, move down and delete, offer Add module, group lessons under their module, and give each lesson a Module picker. Lessons SHALL move up and down only within their module.

#### Scenario: Add
- **WHEN** staff add a module without a title
- **THEN** the field says "Enter a name"; with a title the module is added and announced

#### Scenario: Move a lesson to a module
- **WHEN** staff pick another module in the lesson's Module sheet
- **THEN** the lesson moves there and the result is announced

#### Scenario: Delete
- **WHEN** staff delete a module
- **THEN** the confirmation says its lessons stay in the course

#### Scenario: No modules
- **WHEN** a course has no modules
- **THEN** lessons show no module controls or group headings
