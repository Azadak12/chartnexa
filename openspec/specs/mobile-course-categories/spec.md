# mobile-course-categories Specification

## Purpose
TBD - created by archiving change course-categories. Update Purpose after archive.

## Requirements

### Requirement: Students filter the catalog by topic
Home SHALL show a row of topic chips for categories with published courses, with "All topics" first, and filter the list by the chosen one. The choice SHALL be remembered with the other filters.

#### Scenario: Choose a topic
- **WHEN** a student taps a topic
- **THEN** the list shows that topic's courses and the chip is announced as selected

#### Scenario: Categories unavailable
- **WHEN** categories cannot be loaded
- **THEN** the catalog still works without the topic row

### Requirement: Staff pick and manage categories
The course form SHALL offer "No category" and every category. Admins and Managers SHALL reach a Categories screen from Manage courses to add, rename and delete, with loading, empty, error and permission states.

#### Scenario: Taken name
- **WHEN** a staff member adds a name that exists
- **THEN** the field shows "A category with this name already exists" and the typed name stays

#### Scenario: Category in use
- **WHEN** a staff member deletes a category that has courses
- **THEN** the screen explains how many courses it has and that they must be moved first
