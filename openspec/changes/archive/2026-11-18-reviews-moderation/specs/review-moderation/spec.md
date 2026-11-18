# Spec Delta

## ADDED Requirements

### Requirement: People can report a review
A signed-in person other than the review's author SHALL be able to report a visible review of a published course with a reason from a fixed list and an optional note of up to 300 characters. Reporting SHALL NOT change what anyone sees.

#### Scenario: Report
- **WHEN** a signed-in person reports a review with a valid reason
- **THEN** the report is stored and the review stays visible

#### Scenario: Own review
- **WHEN** the author reports their own review
- **THEN** the response is 403 and nothing is stored

#### Scenario: Reported twice
- **WHEN** the same person reports the same review again, even simultaneously
- **THEN** exactly one report exists and every response succeeds

#### Scenario: Not reportable
- **WHEN** the review is hidden, unknown, or in an unpublished or unknown course
- **THEN** the response is the same 404

#### Scenario: Invalid or flooding
- **WHEN** the reason is not in the list, the note is too long, the caller is signed out, or the daily limit is reached
- **THEN** the response is 400, 401 or 429 and nothing is stored

#### Scenario: Reporter privacy
- **WHEN** a review is reported
- **THEN** neither the author nor the public can learn who reported

### Requirement: Moderators hide and restore reviews with a reason
A person holding `reviews:moderate` SHALL be able to hide a review with a required reason from a fixed list and a note of up to 500 characters, and restore it. Hiding SHALL remove the review from public lists and the rating totals; restoring SHALL return it. Nothing SHALL hide a review automatically, and no reason SHALL refer to the rating.

#### Scenario: Hide
- **WHEN** a moderator hides a visible review with a valid reason
- **THEN** it leaves the public list, the count and average change exactly, and an audit entry is recorded

#### Scenario: Restore
- **WHEN** a moderator restores a hidden review
- **THEN** it returns to the list and the totals include it again

#### Scenario: Reason required
- **WHEN** the reason is missing or outside the list, or is "other" with a note shorter than 10 characters
- **THEN** the response is 400 and nothing changes

#### Scenario: Idempotent
- **WHEN** a hidden review is hidden again or a visible one restored
- **THEN** the response succeeds with no change and no second audit entry

#### Scenario: No permission
- **WHEN** a Student, an Instructor, or a staff member without `reviews:moderate` tries to hide or restore
- **THEN** the response is 403 and nothing changes

#### Scenario: Many reports
- **WHEN** a review has many reports
- **THEN** it stays visible until a moderator acts

#### Scenario: Races
- **WHEN** a moderator hides while the author edits or deletes, or two moderators act at once
- **THEN** the result is one legal order and the totals equal those recomputed from visible reviews

### Requirement: Staff cannot rewrite a review
No staff action SHALL change a review's rating or text.

#### Scenario: Moderator attempts an edit
- **WHEN** a moderator uses the review-writing route
- **THEN** it can only act on their own review and only if they own the course

### Requirement: Authors see and can appeal a hiding
The author of a hidden review SHALL see that it is hidden with the reason and note, SHALL still be able to edit or delete it, and SHALL be able to appeal once per hiding with a message of up to 500 characters.

#### Scenario: Author sees the state
- **WHEN** the author reads their review after it was hidden
- **THEN** the response includes the reason, the note and whether they can appeal

#### Scenario: Edit while hidden
- **WHEN** the author edits a hidden review
- **THEN** the text and rating change, it stays hidden and the totals do not change

#### Scenario: Appeal
- **WHEN** the author appeals a hidden review that has no appeal for this hiding
- **THEN** an open appeal is stored; a second appeal for the same hiding is refused with 409

#### Scenario: Not hidden or not the author
- **WHEN** someone appeals a visible review or another person's review
- **THEN** the response is 404 or 403 and nothing is stored

### Requirement: A different moderator decides appeals
A moderator other than the one who hid the review SHALL decide an open appeal, upholding the hiding or overturning it (which restores the review). A person with `roles:manage` SHALL be able to decide any appeal.

#### Scenario: Overturn
- **WHEN** another moderator overturns the appeal
- **THEN** the review is restored, the totals include it and the author sees the decision

#### Scenario: Uphold
- **WHEN** another moderator upholds the appeal
- **THEN** the review stays hidden and the author sees the decision

#### Scenario: Same moderator
- **WHEN** the moderator who hid the review tries to decide its appeal without `roles:manage`
- **THEN** the response is 403 and the appeal stays open

#### Scenario: Decided twice
- **WHEN** an appeal that is already decided is decided again
- **THEN** the response is 409 and nothing changes

### Requirement: Moderators have a queue
A moderator SHALL be able to page through Reported, Hidden and Appeals lists and open a review's detail with its reports (reason and time) and history. Others SHALL be refused.

#### Scenario: Queue
- **WHEN** a moderator opens a tab
- **THEN** reviews appear newest activity first with report counts, in stable pages

#### Scenario: Refused
- **WHEN** a Student or Instructor requests the queue
- **THEN** the response is 403

#### Scenario: Role removed
- **WHEN** a moderator's permission is removed and they reuse the same token
- **THEN** the next request is refused

### Requirement: Moderation is audited without personal text
Every report, hide, restore, appeal and decision SHALL be audited with ids, the reason code or decision and the review's rating bucket, and never with review text, notes or email addresses.

#### Scenario: Audit content
- **WHEN** moderation actions happen
- **THEN** audit rows and logs contain ids and codes only
