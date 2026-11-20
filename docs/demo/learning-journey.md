# Guided learning experience

Implemented in `engaging-learning-journey`, following the owner's 2026-11-20 approval of the Home → My Learning → lesson completion scope.

## Student flow

- Home leads with a navy and blue next-lesson panel containing the actual course, next lesson and progress. Live class information follows it, then the market preview and course discovery. An empty resume result offers Explore courses; failures have a separate retry.
- My Learning reuses the next-lesson panel and adds Your learning path. Expanding it loads the current course outline and progress; modules expand into connected lesson nodes with Completed, Up next and Ready when you are labels. No artificial lesson locks are introduced.
- Course titles still open course details. Separate Start and Continue buttons fetch current enrollment and the next lesson on demand and open it directly. Review course opens the curriculum when no unfinished lesson remains. Empty courses have no lesson button. Failed requests remain retryable; revoked access does not navigate to a paid lesson.
- Library filters and scroll position remain in session memory. Totals describe loaded courses, and failed pagination has an explicit retry.
- The reader presents step text in a focused surface. Confirmed lesson completion (including video progress) displays course progress, a next-incomplete-lesson action when available, and a way back to My Learning. Completing every lesson shows a course milestone. Text completion retains undo; failed mutations never fabricate completion.

## Technical boundaries

Uses existing course, outline, progress and continue-learning APIs. No backend, entitlement, payment, XP, streak or assessment changes. No new packages. Path requests run only when expanded. Accessible labels, growing controls, shared reduced-motion behavior and existing error mapping are retained.

## Verification

Typecheck, scoped ESLint, OpenSpec strict validation and native iOS/Android bundle exports pass. The existing mobile suite passes (845 tests), and the new interaction suite passes (10 tests): 855 tests across 61 suites. Results are recorded in the change tasks.

## Device review still needed

No iOS simulator tools are installed on this machine. Visual layout on a physical device, VoiceOver/TalkBack, large text, small-screen wrapping and gestures have not been manually verified. Check Home and My Learning at 320/390-point widths, expand/collapse modules, resume a lesson, mark/undo completion, test a video completion, and revisit with a lost connection or revoked access.
