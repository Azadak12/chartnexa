# Spec Delta

## ADDED Requirements

### Requirement: The reader shows a lesson in short steps
The reader SHALL split the lesson text into steps at blank lines and show one step at a time, with Back and Next buttons, a text label "Step N of M", and a progress bar that is also described in text. Step text SHALL be shown exactly as written and never interpreted.

#### Scenario: Several paragraphs
- **WHEN** a lesson has four paragraphs separated by blank lines
- **THEN** the reader opens on "Step 1 of 4" with only the first paragraph, Back is disabled, and Next shows the second paragraph

#### Scenario: Last step
- **WHEN** the person reaches the final step
- **THEN** Next is replaced by "Back to course" as the main button and Back still works

#### Scenario: One paragraph or no blank lines
- **WHEN** a lesson has a single paragraph, however long
- **THEN** it is one step, the step label is omitted, and the text is never cut mid-sentence

#### Scenario: Empty lesson
- **WHEN** a lesson has no text
- **THEN** the existing "This lesson has no text yet" state is shown with no step controls

#### Scenario: Messy text
- **WHEN** the text has Windows line endings, runs of blank lines, or leading and trailing blank lines
- **THEN** empty steps are never shown and the number of steps equals the number of non-empty paragraphs

#### Scenario: Markup stays text
- **WHEN** a paragraph contains angle brackets or script-like text
- **THEN** it is shown as typed

### Requirement: Readers can show all the text at once
The reader SHALL offer "Show all text", which shows the whole lesson as one page without step controls, and "Show in steps" to return. The choice SHALL be remembered while the app is open.

#### Scenario: Switch and return
- **WHEN** a person chooses Show all text, opens another lesson, and comes back
- **THEN** the lessons open in the same mode and Show in steps is offered

### Requirement: The reader remembers the step while the app is open
Leaving the reader and returning to the same lesson SHALL reopen the step the person was on. Signing out SHALL clear it. It SHALL NOT be saved across app restarts or sent to the server.

#### Scenario: Back and return
- **WHEN** a person reads to step 3, goes back to the course page and reopens the lesson
- **THEN** step 3 is shown

#### Scenario: The lesson changed meanwhile
- **WHEN** the remembered step number is larger than the new number of steps
- **THEN** the last step is shown instead

### Requirement: Step reading is accessible
Moving to a step SHALL announce "Step N of M" to screen readers and move focus to the step text; Next, Back and the mode switch SHALL have labels and at least 44-point touch targets; text SHALL scale with the system font size without clipping the buttons; animation SHALL be off when reduced motion is on.

#### Scenario: Screen reader
- **WHEN** a screen-reader user presses Next
- **THEN** the new step is announced and focus lands on its text

#### Scenario: Large text
- **WHEN** the system font is at its largest
- **THEN** the step text scrolls and the buttons stay reachable

### Requirement: Lost access and loading states are unchanged
Loading, error with Retry, "no longer available" and "you no longer have access" states SHALL behave as before; no step text SHALL remain visible after access is lost.

#### Scenario: Access lost
- **WHEN** the server refuses a lesson with `ENROLLMENT_REQUIRED`
- **THEN** the no-access state is shown with no lesson text
