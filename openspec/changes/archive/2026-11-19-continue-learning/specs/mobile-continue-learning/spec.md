# Spec Delta

## ADDED Requirements

### Requirement: Home offers to continue
Home SHALL show a "Continue learning" card with the course, its progress and the next lesson's title, and Continue SHALL open that lesson. The card SHALL not show while loading, on error, or when nothing is left.

#### Scenario: Nothing to resume
- **WHEN** the person owns no unfinished course
- **THEN** home shows no card
