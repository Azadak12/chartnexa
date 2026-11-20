## MODIFIED Requirements

### Requirement: Home offers to continue
Home SHALL show a prominent "Continue learning" card before market and catalog content with the course, progress and next lesson title. Continue SHALL open that lesson. Loading SHALL show a placeholder, failure SHALL offer retry, and an empty result SHALL offer course discovery without a resume card.

#### Scenario: Nothing to resume
- **WHEN** the person owns no unfinished course
- **THEN** home shows no resume card and offers course discovery

#### Scenario: Resume fails
- **WHEN** the resume request fails
- **THEN** a retry action appears while the rest of Home remains usable
