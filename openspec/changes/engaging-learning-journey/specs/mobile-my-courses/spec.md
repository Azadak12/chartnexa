## ADDED Requirements

### Requirement: Direct learning actions
Owned courses SHALL retain course-detail navigation and offer separate Start or Continue actions resolving the current next lesson. Completed courses SHALL offer review. Empty courses SHALL not offer a lesson action.

#### Scenario: Start or resume
- **WHEN** a student presses Start or Continue
- **THEN** the current next lesson opens directly after the server supplies it

#### Scenario: Access lost or network fails
- **WHEN** resolving a lesson fails or the student is no longer enrolled
- **THEN** an actionable message appears without opening a paid lesson

### Requirement: Expandable active course journey
My Learning SHALL feature the resume course and offer an expandable module path with completed and next lesson labels. Loading and failure SHALL remain distinct from no progress.

#### Scenario: Explore the path
- **WHEN** a student expands their learning path
- **THEN** modules and lesson links appear with completion based on server progress and a retry if loading fails
