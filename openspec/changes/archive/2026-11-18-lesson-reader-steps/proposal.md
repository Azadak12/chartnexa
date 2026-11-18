# Proposal

## Why

Lessons are plain text of up to 20,000 characters, shown as one long page. On a phone that is a wall of text, which is the main weakness the UX reference review found in the reader (`docs/11_UX_REFERENCE_REVIEW.md`, idea 3). Breaking a lesson into short steps makes it easier to read and to resume, and it needs no server work: the text already has paragraphs.

## What Changes

- The lesson reader shows the lesson **one short step at a time**. A step is one paragraph (text separated by a blank line). **Next** and **Back** buttons move between steps; a line of text and a thin bar show "Step 2 of 6".
- **Show all text** switches to the current single long page for people who prefer it (and for screen-reader users who want to move through the whole lesson freely). The choice is remembered on the device for the session only.
- Where the person stopped is remembered while the app is open, so going back to the course page and returning reopens the same step.
- The last step shows **Back to course** as its main button.
- Tapping or swiping is not required: buttons are the only way to move, and they work with a screen reader, a keyboard and larger text. Screen readers hear the new step announced; focus moves to the step text.
- No change to the server, the data, permissions, lesson authoring or what any person is allowed to read.
- **Not included:** saved progress or completion (needs `player-resources-progress`, Q07), a "continue where you stopped" card on Home, swipe gestures, tap-to-reveal bubbles, quizzes or feedback, haptics, animation beyond a fade that is turned off with reduced motion, Markdown, images, and any game mechanics (Q21).

## Confirmation status

- Confirmed: lessons are plain text shown as text, never interpreted (R11 area, `course-lessons`); the app is white, black and blue with calm motion; screens need loading, empty and error states and accessibility checks.
- Proposed here, needs owner approval: one paragraph per step; "Show all text" as the escape hatch; step position remembered in memory only, not across app restarts; reading the lesson in steps is the default for everyone.
- Pending and not decided: how completion and progress work (Q07). Steps do not mark anything complete.

## Capabilities

### Modified Capabilities
- `mobile-course-lessons`: the reader shows lessons in steps.

## Impact

- App only: the reader screen, a small pure function that splits text into steps, tests, README checklist rows.
- No API, database, contract or dependency changes. No secrets.
