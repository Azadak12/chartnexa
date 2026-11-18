# Design

## Context

`LessonReaderScreen` loads one lesson (`["lesson", courseId, lessonId]`) and shows its title and body inside `Screen`. Remembered UI state already exists (`useScreenMemoryState`, in memory, cleared on sign-out). `StateView`, `Button`, `Banner`, reduced-motion hook and accessibility helpers (`focusElement`) exist. See `docs/11_UX_REFERENCE_REVIEW.md` for why.

## Decisions (proposed)

1. **Pure splitter** `splitLessonText(text): string[]` in `src/lessons/steps.ts`: normalize `\r\n` and `\r` to `\n`, split on one or more blank lines (lines of only spaces count as blank), trim each piece, drop empty pieces. A paragraph is never cut, so long paragraphs stay whole (a 20,000-character single paragraph is one step, readable by scrolling). Unit-tested on its own, including property-style cases (joining the steps gives back the non-whitespace content, the count equals the non-empty paragraphs).
2. **State** in the reader: `step` and `mode` via `useScreenMemoryState` keyed `lesson-step:${courseId}:${lessonId}` and `lesson-mode`. Clamp the step to the new range after load. In memory only, as the proposal says.
3. **UI:** top row "Lesson N · Step i of m" in text with a thin progress bar (`accessibilityRole="progressbar"`, value text "Step i of m"); the step text in the existing `Text`; a bottom button row with Back (secondary) and Next (primary) or "Back to course" on the last step; "Show all text" as a tertiary link-style button under the text. Layout stays white, black and blue; no gradients or new colors.
4. **Accessibility:** on step change call `AccessibilityInfo.announceForAccessibility("Step i of m")` and `focusElement` on the text container (`accessible`, labelled by the step). Buttons use existing `Button` (44-point minimum). Reduced motion: no fade at all when on; the default fade is 150 ms.
5. **No server or contract changes.** Progress is not recorded; reaching the last step does not mark the lesson complete (Q07).
6. **Edge cases handled in the splitter and screen:** empty text, whitespace only, one paragraph, many tiny paragraphs (for example 200), markup text, very long text, CRLF, a lesson edited between visits.

## Risks / Trade-offs

- Splitting only on blank lines depends on how staff write lessons. Lessons typed as one long block stay one step. Mitigation: the staff lesson form hint can mention "Leave a blank line between paragraphs" (a one-line text change, included in the tasks).
- Many tiny steps could feel slow. Mitigation: "Show all text" is one tap away; merging short paragraphs is deliberately not done to keep behavior predictable.
- Remembering in memory only means a restart returns to step 1; saved progress comes with `player-resources-progress`.

## Migration and rollback

App-only change. Rollback is reverting the commit; no data is touched.

## Open Questions (owner)

1. Is one paragraph per step right? (Proposed: yes.)
2. Should steps be the default, with "Show all text" as the alternative? (Proposed: yes.)
