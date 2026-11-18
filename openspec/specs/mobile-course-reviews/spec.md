# mobile-course-reviews Specification

## Purpose
TBD - created by archiving change course-reviews-basic. Update Purpose after archive.

## Requirements

### Requirement: Ratings show on cards and the course page
Catalog cards and the course page SHALL show the average and count in text ("4.5 · 12 reviews", or "No reviews yet"), with stars as decoration only and an accessibility label that reads the same text.

#### Scenario: Summary
- **WHEN** a course has 12 reviews averaging 4.5
- **THEN** the card and the page read "4.5 · 12 reviews"

#### Scenario: One review
- **WHEN** a course has one review
- **THEN** the text says "1 review", not "1 reviews"

### Requirement: The course page lists reviews
The course page SHALL list reviews newest first, 10 at a time, with loading, empty ("No reviews yet"), error-with-retry and offline states, and a "Show more" button that loads the next page.

#### Scenario: Open and page
- **WHEN** a person opens a course with 25 reviews and presses Show more twice
- **THEN** the pages load in order without repeats

#### Scenario: A failing list
- **WHEN** the list fails to load
- **THEN** an actionable error with Retry appears and the rest of the page stays usable

### Requirement: Owners can write, edit and delete their review
An owner SHALL see "Write a review" (or "Edit your review"), which opens a sheet with five star buttons (each labelled "3 stars" and selected state in text), a text box with a character count, and Save; and "Delete your review" asking for confirmation. Non-owners SHALL see none of these.

#### Scenario: Write
- **WHEN** an owner picks 4 stars, writes text and saves
- **THEN** the sheet closes, the review appears at the top, the summary updates, and "Review saved" is announced

#### Scenario: Validation
- **WHEN** no star is chosen or the text is too long
- **THEN** the error appears at the field, typed text is kept, and nothing is sent

#### Scenario: Retry without duplicates
- **WHEN** a save fails because the connection dropped and the person presses Save again
- **THEN** the same one review is saved, never two

#### Scenario: Double press
- **WHEN** Save is pressed twice quickly
- **THEN** one request is sent

#### Scenario: Delete
- **WHEN** the owner chooses Delete your review
- **THEN** a dialog names what will happen with Cancel as the default, and confirming removes the review and updates the summary

#### Scenario: Access lost
- **WHEN** the server refuses because access has ended
- **THEN** a friendly no-access message is shown, typed text is kept, and the course page refreshes

### Requirement: The review controls are accessible
Stars SHALL work as a group of five labelled buttons (not drag-only), targets SHALL be at least 44 points, focus SHALL return to the opening control when the sheet closes, text SHALL scale without clipping, and meaning SHALL never rely on color alone.

#### Scenario: Screen reader
- **WHEN** a screen-reader user chooses a star
- **THEN** it is announced as "4 stars, selected" and the others as not selected
