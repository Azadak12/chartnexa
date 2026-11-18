# mobile-course-browsing Specification

## Purpose
Defines how students find and open courses in the app.

## Requirements

### Requirement: Catalog on Home
Home SHALL show the published courses as cards with cover, title, level and price, loading more as the person scrolls, with search and a level filter.

#### Scenario: Browse
- **WHEN** a signed-in student opens Home
- **THEN** published courses are shown newest first with price shown as dollars or "Free"

#### Scenario: Search and filter
- **WHEN** the student types in search or picks a level
- **THEN** the list shows only matching courses and says so when there are none

#### Scenario: States
- **WHEN** the catalog is loading, empty, offline or failed
- **THEN** the standard state appears, and failures offer Retry

### Requirement: Position is remembered
Opening a course and coming back SHALL return to the same scroll position, search text and level filter.

#### Scenario: Open and return
- **WHEN** a student scrolls, filters, opens a course and goes back
- **THEN** the list shows the same filter, search and position

### Requirement: Course page
A course page SHALL show the cover, title, level, price and full description, SHALL say that enrollment is coming rather than offering a purchase, and SHALL handle a missing course gracefully.

#### Scenario: Open a course
- **WHEN** a student opens a course
- **THEN** its details and price are shown and the enrollment notice appears

#### Scenario: Not found
- **WHEN** the course was unpublished or never existed
- **THEN** a friendly not-found state with a way back to Home appears

#### Scenario: Deep link while signed out
- **WHEN** a signed-out person opens a course link
- **THEN** they sign in and arrive on that course
