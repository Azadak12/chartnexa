## ADDED Requirements

### Requirement: Visible discovery controls
Explore SHALL offer direct topic and level selection alongside search and the filter sheet, preserving selected filters when a pending search completes. Cards SHALL show the real course summary, artwork, level, rating and price. Failed pagination SHALL offer retry.

#### Scenario: Search while choosing a level
- **WHEN** a student selects a level while a search is pending
- **THEN** the final request contains both the search and selected level

#### Scenario: Clear discovery choices
- **WHEN** the student clears all filters
- **THEN** the search, topic and level selections reset

### Requirement: Course decision panels
Course details SHALL show actual lesson and preview counts, name the available preview for non-owners and show the next lesson for owners when available. Failed outline loading SHALL offer retry instead of claiming no topics exist. Failed review navigation SHALL show a retryable error.

#### Scenario: Preview availability
- **WHEN** a non-owner opens a course with a preview
- **THEN** the preview title and existing preview action appear without granting enrollment

#### Scenario: Content unavailable
- **WHEN** the outline request fails
- **THEN** the student can retry and no empty-topic claim appears

#### Scenario: Duplicate review press
- **WHEN** the student presses review repeatedly while resolving a lesson
- **THEN** at most one navigation request runs at a time
