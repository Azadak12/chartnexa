# Spec Delta

## ADDED Requirements

### Requirement: Course detail exposes the lesson count
The public course detail SHALL include the number of lessons and the number marked free preview.

#### Scenario: Counts
- **WHEN** anyone opens a published course with 12 lessons, 2 of them preview
- **THEN** the detail shows 12 and 2

#### Scenario: Empty course
- **WHEN** a published course has no lessons
- **THEN** the counts are 0 and the app shows an empty curriculum state, not an error
