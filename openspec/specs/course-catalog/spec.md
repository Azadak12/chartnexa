# course-catalog Specification

## Purpose
Defines what anyone can see of the course catalog: only published courses, findable by title and level, in a stable order.

## Requirements

### Requirement: Public catalog lists only published courses
The system SHALL list published courses to anyone, newest published first, one page at a time with a maximum page size, and SHALL never include drafts.

#### Scenario: Draft hidden
- **WHEN** a draft course exists
- **THEN** it does not appear in the public list, whoever asks

#### Scenario: Paging
- **WHEN** more courses exist than fit one page
- **THEN** a cursor returns the next page with no duplicates or gaps, even if courses are published in between

#### Scenario: Bad cursor or limit
- **WHEN** the cursor is tampered with or the limit exceeds the maximum
- **THEN** the response is 400 in the error envelope

### Requirement: Search and filter
The catalog SHALL support searching by title text and filtering by level, treating search text as plain text.

#### Scenario: Title search
- **WHEN** a client searches for part of a title in any letter case
- **THEN** only matching published courses are returned

#### Scenario: Level filter
- **WHEN** a client filters by a level
- **THEN** only courses of that level are returned

#### Scenario: Special characters
- **WHEN** the search text contains wildcard or quote characters
- **THEN** they match literally and nothing breaks or leaks

### Requirement: Open one published course
The system SHALL return a published course's public details by id and SHALL answer 404 for drafts and unknown ids alike.

#### Scenario: Published course
- **WHEN** a client opens a published course
- **THEN** it receives title, description, level, price and cover tone and no staff-only fields

#### Scenario: Draft or unknown
- **WHEN** a client opens a draft or a course that does not exist
- **THEN** the response is the same 404
