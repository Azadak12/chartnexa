# course-categories Specification

## Purpose
Lets staff group courses into named categories and lets everyone filter the catalog by category.

## Requirements

### Requirement: Staff manage categories
A person holding `categories:manage` SHALL be able to add, rename and delete categories. Names SHALL be 2 to 40 characters and unique ignoring case; there SHALL be at most 50. Every change SHALL be audited.

#### Scenario: Add
- **WHEN** a Manager adds "Forex"
- **THEN** it is stored, audited and listed

#### Scenario: Duplicate
- **WHEN** someone adds "forex" while "Forex" exists, or the same name is sent several times at once
- **THEN** one category exists and the others get a field error on `name`

#### Scenario: Limit
- **WHEN** creates would pass 50 categories, even simultaneously
- **THEN** the extra ones answer 409

#### Scenario: Rename
- **WHEN** a rename carries an old version, or two renames start from the same version
- **THEN** only one succeeds and the other answers 409

#### Scenario: Delete
- **WHEN** a category still has any course
- **THEN** delete answers 409 naming how many; an unused one is deleted, and deleting it again still succeeds

#### Scenario: No permission
- **WHEN** a Student, an Instructor or a signed-out caller tries to manage categories
- **THEN** the response is 403 or 401

### Requirement: Courses have an optional category
A course SHALL have at most one category, set on create or edit. An unknown category SHALL be a field error, and a course SHALL never point at a deleted category.

#### Scenario: Assign and remove
- **WHEN** staff set, change or clear a course's category
- **THEN** the course response shows the new `categoryId` and the change is audited

#### Scenario: Delete races assignment
- **WHEN** a category is deleted while a course is being moved into it
- **THEN** either the move or the delete fails cleanly, and no course points at a missing category

### Requirement: The catalog can be filtered by category
Anyone SHALL be able to list categories with their published course counts in name order, and filter the catalog by one category with the usual paging.

#### Scenario: Filter
- **WHEN** the catalog is requested with a category
- **THEN** only published courses in it are returned, newest first, in stable pages

#### Scenario: Counts
- **WHEN** a category has published and draft courses
- **THEN** the public count includes only the published ones
