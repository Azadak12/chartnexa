# Tasks

## 1. Splitting and state

- [x] 1.1 Add `splitLessonText` in `apps/mobile/src/lessons/steps.ts`; verify unit tests for empty, whitespace-only, one paragraph, several paragraphs, CRLF and old-Mac line endings, runs of blank lines, leading and trailing blanks, blank lines containing spaces, markup text, a 20,000-character paragraph, 200 tiny paragraphs, and that no step is empty and the content is preserved.

## 2. Reader screen

- [x] 2.1 Show the lesson in steps with Back, Next, the "Step N of M" label and progress bar, "Back to course" on the last step, "Show all text" and "Show in steps", and remembered step and mode; verify component tests for every scenario in `mobile-course-lessons` (several paragraphs, last step, single paragraph, empty lesson, messy text, markup, mode switch remembered, step remembered after going back, clamp when the lesson got shorter, sign-out clears memory).
- [x] 2.2 Add accessibility behavior: announcement and focus on step change, labels, 44-point targets, reduced motion, large text; verify tests for the announcement, focus call, button labels and states, disabled Back on step 1, and no animation when reduced motion is on.
- [x] 2.3 Keep loading, error, not-available and lost-access states unchanged; verify the existing reader tests still pass and a test that no step text remains after `ENROLLMENT_REQUIRED`.
- [x] 2.4 Add the staff lesson form hint about blank lines between paragraphs; verify a test for the hint text.

## 3. Closing

- [x] 3.1 Update `apps/mobile/README.md` and the manual device checklist (screen reader step announcements, largest text, reduced motion, one-handed use) and add contract coverage that a lesson read through the real API still arrives unchanged; verify by running the contract suite.
- [x] 3.2 Run mutation checks on the splitter and the step clamp; record results and what could not be verified on a device.
- [ ] 3.3 Run the full checks and `openspec validate lesson-reader-steps` (done, see Evidence); after review and merge, archive with `openspec archive`.

## Evidence

- Local run (Node 26, PostgreSQL 16): lint, format, builds, typecheck, secrets scan and migration round trip all exit 0; 267 API tests (unchanged), 339 app unit tests (28 new: 11 for the splitter, 16 for the reader, 1 for the staff hint), 41 contracts tests and 27 app contract tests against the real API (the lesson flow now also checks that blank-line paragraphs, Windows line endings and markup survive the round trip and split into the expected steps).
- `pnpm check` itself cannot run in this container (Turbo's binary fails with "Exec format error"), so the same steps ran one by one; CI is the authoritative run.
- Mutation checks (change made, tests run, change reverted): splitting only on exactly two newlines, no line-ending normalization, empty steps kept, no trimming, clamp allowing a step past the end, the reader not clamping, no announcement on step change, the fade ignoring reduced motion, and Back never disabled. All caused failures.
- Not verified (no device or simulator): that the screen reader really moves focus onto the step text (tests check that focus is requested and the announcement is made, not what TalkBack or VoiceOver then does), large-text layout, one-handed reach of the buttons, and how the 150 ms fade feels. Rows were added to the manual checklist in `apps/mobile/README.md`.
- Not done by design: saved progress, completion, swipe gestures and a Home "continue" card (they need `player-resources-progress`, Q07).
