# course-reviews Specification

## Purpose
Lets owners rate and review a course once, and shows ratings and reviews to everyone.

## Requirements

### Requirement: Only owners write reviews, one per course
A signed-in person with an active entitlement to a course SHALL be able to write one review of it, with a rating from 1 to 5 and optional text of up to 1,000 characters. The server SHALL check the entitlement on every write.

#### Scenario: First review
- **WHEN** an owner submits a rating of 4 with some text
- **THEN** the review is saved, the course's rating summary includes it, and the response returns the review

#### Scenario: Not an owner
- **WHEN** a signed-out caller, or a signed-in person without an active entitlement, submits a review
- **THEN** the response is 401 or 403 with `ENROLLMENT_REQUIRED` and nothing changes

#### Scenario: Revoked owner
- **WHEN** access is revoked and the same token submits, edits or deletes a review
- **THEN** the response is 403 and nothing changes

#### Scenario: Invalid input
- **WHEN** the rating is missing, not a whole number from 1 to 5, or the text is over 1,000 characters or contains control characters
- **THEN** the response is 400 with field errors and nothing is saved

#### Scenario: Markup stays text
- **WHEN** the text contains angle brackets or script-like content
- **THEN** it is stored and shown as typed text

### Requirement: Submitting twice gives one review and a correct summary
A person SHALL have at most one review per course. Submitting again SHALL replace their rating and text, never add a second review, and the summary SHALL stay consistent with the reviews that exist, including under simultaneous requests.

#### Scenario: Submit again
- **WHEN** an owner who already reviewed submits a new rating
- **THEN** their review is updated, the count stays the same and the average reflects the new rating

#### Scenario: Simultaneous submits
- **WHEN** the same person sends the same submit several times at the same moment
- **THEN** exactly one review exists and the summary counts it once

#### Scenario: Many people at once
- **WHEN** ten different owners submit at the same moment
- **THEN** the count is ten and the average equals the true mean of the ratings

#### Scenario: Edit and delete
- **WHEN** an owner edits their review and later deletes it
- **THEN** the summary follows each step exactly, and after deletion they may write a new one

#### Scenario: Delete twice
- **WHEN** a review is deleted twice
- **THEN** the second request still succeeds and changes nothing

### Requirement: Nobody changes someone else's review
A review SHALL be changed or deleted only by its author, using the author's own identity from the token and never from the request.

#### Scenario: Another owner
- **WHEN** a different owner of the same course tries to edit or delete a review
- **THEN** they can only reach their own review; there is no way to name another person's

### Requirement: The summary is stored and exact
The rating summary SHALL be the number of visible reviews and their average rounded to one decimal, taken from totals updated in the same transaction as each change. Reviews hidden by moderation SHALL NOT count. A course with no visible reviews SHALL show a count of 0 and no average.

#### Scenario: Totals match the reviews
- **WHEN** reviews are added, edited, deleted, hidden and restored in any order
- **THEN** the stored count and sum always equal the count and sum recomputed from the visible reviews

#### Scenario: Failure in the middle
- **WHEN** a write fails after the review row changed
- **THEN** both the review and the totals are rolled back

#### Scenario: Editing a hidden review
- **WHEN** the author edits or deletes a review that is hidden
- **THEN** the totals do not change

### Requirement: Anyone can read reviews of a published course
Anyone SHALL be able to page through a published course's visible reviews, newest first, with the rating, text, date and reviewer name, and to see the summary on the course detail and on catalog cards. Hidden reviews SHALL NOT appear. Draft and unknown courses SHALL answer the same 404, except that owners still read an unpublished course's reviews.

#### Scenario: Paging
- **WHEN** a course has more reviews than one page
- **THEN** paging is stable while reviews are added or removed meanwhile

#### Scenario: Reviewer privacy
- **WHEN** reviews are listed
- **THEN** each shows the display name or "Student", and no email address, user id or other personal data

#### Scenario: Unpublished course
- **WHEN** a course is unpublished
- **THEN** the public gets 404 for its reviews, and its owners can still read them

#### Scenario: A person's own review
- **WHEN** a signed-in owner reads the course's reviews
- **THEN** their own review is also available separately so the app can offer Edit, including its moderation state when it is hidden

#### Scenario: Hidden review
- **WHEN** a review is hidden
- **THEN** it is absent from the public list, and appears again after it is restored

### Requirement: Account deletion removes the person's reviews
Deleting an account SHALL delete the person's reviews, reports and appeals and correct the totals for visible reviews in the same transaction.

#### Scenario: Deleted account
- **WHEN** a person with reviews on three courses deletes their account
- **THEN** their reviews are gone, each course's count and average are corrected, and a failure cancels the deletion

#### Scenario: Hidden review of a deleted account
- **WHEN** the person deleting their account has a hidden review
- **THEN** it is deleted with its reports and appeals and the totals stay correct without subtracting it twice

### Requirement: Logs hold no review text
Review writes SHALL log only ids and outcomes.

#### Scenario: Logs
- **WHEN** reviews are written and read
- **THEN** request logs contain neither review text nor email addresses
