# Tasks

## 1. Splitting and state

- [ ] 1.1 Add `splitLessonText` in `apps/mobile/src/lessons/steps.ts`; verify unit tests for empty, whitespace-only, one paragraph, several paragraphs, CRLF and old-Mac line endings, runs of blank lines, leading and trailing blanks, blank lines containing spaces, markup text, a 20,000-character paragraph, 200 tiny paragraphs, and that no step is empty and the content is preserved.

## 2. Reader screen

- [ ] 2.1 Show the lesson in steps with Back, Next, the "Step N of M" label and progress bar, "Back to course" on the last step, "Show all text" and "Show in steps", and remembered step and mode; verify component tests for every scenario in `mobile-course-lessons` (several paragraphs, last step, single paragraph, empty lesson, messy text, markup, mode switch remembered, step remembered after going back, clamp when the lesson got shorter, sign-out clears memory).
- [ ] 2.2 Add accessibility behavior: announcement and focus on step change, labels, 44-point targets, reduced motion, large text; verify tests for the announcement, focus call, button labels and states, disabled Back on step 1, and no animation when reduced motion is on.
- [ ] 2.3 Keep loading, error, not-available and lost-access states unchanged; verify the existing reader tests still pass and a test that no step text remains after `ENROLLMENT_REQUIRED`.
- [ ] 2.4 Add the staff lesson form hint about blank lines between paragraphs; verify a test for the hint text.

## 3. Closing

- [ ] 3.1 Update `apps/mobile/README.md` and the manual device checklist (screen reader step announcements, largest text, reduced motion, one-handed use) and add contract coverage that a lesson read through the real API still arrives unchanged; verify by running the contract suite.
- [ ] 3.2 Run mutation checks on the splitter and the step clamp; record results and what could not be verified on a device.
- [ ] 3.3 Run the full checks and `openspec validate lesson-reader-steps`; after review and merge, archive with `openspec archive`.
