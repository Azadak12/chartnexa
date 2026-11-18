# Spec Delta

## MODIFIED Requirements

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
