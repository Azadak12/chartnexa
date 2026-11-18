# mobile-my-courses Specification

## Purpose
TBD - created by archiving change entitlements-core. Update Purpose after archive.

## Requirements

### Requirement: My Courses shows owned courses
The My Courses tab SHALL list the person's courses with loading, empty ("You have not enrolled in any courses yet"), error-with-retry and offline states, remembered scroll position, and paging, and open the course page on tap.

#### Scenario: Owned courses
- **WHEN** a student with access opens My Courses
- **THEN** their courses appear with title, level and a text label "Not currently on sale" where the course is unpublished

#### Scenario: Signed out or expired session
- **WHEN** the session has ended
- **THEN** the person is sent to sign in and returns to My Courses afterwards

### Requirement: The course page shows enrollment state
For an owner the course page SHALL say "You are enrolled" in text (not only by color), replace the "Enrollment is coming soon" notice, and open every lesson in the reader. For everyone else it SHALL keep the notice and locked lessons.

#### Scenario: Owner opens a locked lesson
- **WHEN** an owner taps a lesson that is not a free preview
- **THEN** the reader opens with its text

#### Scenario: Access removed while reading
- **WHEN** the server answers `ENROLLMENT_REQUIRED` for a lesson the person had open
- **THEN** a friendly "you no longer have access" state with a way back is shown and no text stays visible

### Requirement: Staff manage access to a course
Staff with enrollment rights SHALL see Students on a course's management screen, with the list of people who have access, Grant access by email, and Revoke.

#### Scenario: Grant by email
- **WHEN** staff enter a student's email and a reason and confirm
- **THEN** the student appears in the list, and a repeat grant says they already have access

#### Scenario: Unknown or ineligible email
- **WHEN** the email has no account, or the account cannot be granted
- **THEN** a clear message is shown at the field, nothing is added, and typed text is kept

#### Scenario: Revoke
- **WHEN** staff choose Revoke
- **THEN** a confirmation dialog names the person and course, asks for a reason, and Cancel is the default focus

#### Scenario: Without rights
- **WHEN** a person without enrollment rights opens the Students screen
- **THEN** a no-access state is shown and no student data is fetched

#### Scenario: Accessibility
- **WHEN** the screens are used with a screen reader and larger text
- **THEN** every control has a label, results are announced ("Access granted", "Access revoked"), focus returns sensibly after sheets and dialogs, and targets are at least 44 points
