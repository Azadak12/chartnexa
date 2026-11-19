# course-modules Specification

## Purpose
TBD - created by archiving change course-modules. Update Purpose after archive.

## Requirements

### Requirement: Staff organize a course into modules
A person allowed to author a course's lessons SHALL be able to add, rename, reorder and delete up to 50 modules. Deleting a module SHALL keep its lessons in the course without a module. Every change SHALL be audited.

#### Scenario: Add and reorder
- **WHEN** staff add modules and send a new full order
- **THEN** modules take that order; a list that does not match the course's modules exactly answers 409

#### Scenario: Delete
- **WHEN** a module with lessons is deleted
- **THEN** the lessons remain without a module, positions stay gapless, and deleting again still succeeds

#### Scenario: Rename
- **WHEN** a rename carries an old version
- **THEN** it answers 409

#### Scenario: Permission
- **WHEN** an Instructor without a lesson grant for the course, a Student or a signed-out caller tries to change modules
- **THEN** the response is 403 or 401

#### Scenario: Limit and input
- **WHEN** a 51st module is added, or a title is empty or longer than 120 characters
- **THEN** the response is 409 or 400 and nothing changes

### Requirement: Lessons belong to at most one module of their course
A lesson SHALL be created into a module or moved into or out of one, landing at the end of its new group. A module of another course SHALL be refused.

#### Scenario: Move
- **WHEN** a lesson is moved into another module
- **THEN** it becomes that module's last lesson; moving it to no module puts it last among lessons without a module

#### Scenario: Another course's module
- **WHEN** a lesson is created into or moved to a module of a different course
- **THEN** the response is a field error on `moduleId`

### Requirement: There is one reading order grouped by module
Lesson positions SHALL always be 1 to n with lessons without a module first, then each module's lessons in module order. The outline, the reader and Continue SHALL use this order.

#### Scenario: Grouping after any change
- **WHEN** lessons are added, reordered or moved, or modules are reordered or deleted, including at the same time
- **THEN** positions are gapless and grouped by module order

#### Scenario: Continue follows the order
- **WHEN** an owner completes the first lesson of the reading order
- **THEN** the next lesson is the following one in that grouped order

#### Scenario: Outline
- **WHEN** anyone reads a course outline
- **THEN** it lists the modules in order and each lesson's module
