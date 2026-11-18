# Tasks

Prerequisite: PR 22 (`instructor-permission-delegation`) is merged, so Instructor lesson access can use the per-course grant.

## 1. Server data and rules

- [ ] 1.1 Add the `lessons` table, CHECKs, the deferrable unique position constraint and a migration with reviewed `down.sql`; verify `pnpm migrate:roundtrip` passes and tests show the database rejects a short title, a body over 20000, position 0 and a duplicate position at commit.
- [ ] 1.2 Add lesson schemas and limits to `packages/api-contracts`; verify unit tests for valid and invalid lessons, the reorder list (empty, repeated ids, over 200) and the public shapes having no staff fields.
- [ ] 1.3 Implement the lesson service (create at end, edit with version check, delete closing the gap, reorder with the complete-set rule, course row lock, 200 limit) with audit in the same transaction and no body text in audit; verify integration tests for every scenario in `course-lessons` including simultaneous reorder, reorder against add, reorder against delete, two edits from one version, an incomplete or foreign reorder list, and a failure inside the transaction leaving no change.
- [ ] 1.4 Add the staff controller with `lesson:upload` checked against the course in the URL; verify permission tests for Admin, Manager, Instructor with the grant, Instructor on another course, Instructor with only an update grant, Instructor with no grant, Student and signed out, identical 403 bodies for existing and unknown courses, and denial right after a grant is revoked.
- [ ] 1.5 Add the public controller and the single public mapping; verify tests that draft and unknown courses answer 404, a preview lesson returns content, a locked lesson answers 403 with no body text anywhere in the response, a lesson of another course answers 404, turning Preview off takes effect at once, and angle-bracket content is returned unchanged.
- [ ] 1.6 Update the OpenAPI route check in CI for the new routes; verify the check passes with them and fails when one is removed.

## 2. App reading

- [ ] 2.1 Add the app API layer for lessons and a section on the course page that lists lessons marked Preview or Locked with its own loading, empty and error states; verify tests for each state, text markers, and that a lessons failure does not hide the course.
- [ ] 2.2 Build the full-screen preview reader route and the locked-lesson sheet; verify tests for opening a preview, a locked sheet with no content shown, a lesson that changed or vanished, plain-text display of angle brackets, and Back returning to the same place on the course page.

## 3. App staff screens

- [ ] 3.1 Add the access check for lessons and the Lessons entry in the course editor; verify tests for Admin, Manager, Instructor with and without the grant, and an access-denied route that requests nothing.
- [ ] 3.2 Build the Lessons list with Add lesson, Move up and Move down (first and last handled), conflict reload and its message; verify tests for ordering, the 409 path and the screen-reader names of every button.
- [ ] 3.3 Build the add and edit form with the Preview switch, field errors, kept text, double-submit protection and stale-edit handling; verify tests for each scenario.
- [ ] 3.4 Build delete with a named confirmation; verify tests for confirm, cancel, back, 403 and 404, and a double tap sending one request.
- [ ] 3.5 Accessibility pass (labels, 44-point targets, announcements, focus return, large text); verify with tests of roles, labels and focus return, and list what cannot be checked without a device.

## 4. Verification and docs

- [ ] 4.1 Extend the contract tests to a real flow against the API (Manager builds three lessons, reorders, edits, turns one into a Preview; a student lists them, reads the preview and is refused the locked one; an Instructor with and without the grant); verify they pass locally and in CI.
- [ ] 4.2 Record R11 to R13 in `docs/10_DECISION_REGISTER.md` as proposals awaiting approval, and update the API and app READMEs (endpoints, limits, phone walkthrough) and the manual device checklist; verify by following the walkthrough in a fresh clone.
- [ ] 4.3 Run the full `pnpm check` from a fresh clone, confirm CI is green, and write the evidence including what could not be verified on this machine.
