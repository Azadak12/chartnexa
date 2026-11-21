# Tasks

## 1. Already built on main (verify, do not redo)

- [x] 1.1 Top bar with logo, bell, profile circle. Verified by: `home-structure` test for the avatar initials and logo; header-tagline and greeting tests.
- [x] 1.2 Course strip on Home from real courses. Verified by: full Jest suite (888 tests) and TypeScript check.
- [x] 1.3 Readability: type scale 17/14, tab labels 12, lighter secondary text. Verified by: design-tokens tests and contrast tests.
- [x] 1.4 Sign-in and sign-up photo and tagline. Verified by: `auth-design` tests.

## 2. Academy screen structure

- [x] 2.1 Add the strip inside the My Learning progress card, selecting the active course on press. Verified by: test that pressing a strip card changes the selected course, and an empty-state test.
- [x] 2.2 Add the course hero card (title, description, "n/m lessons") with no mastery badge. Verified by: render test with 3 of 12 lessons; test that no percentage or "strong" text appears.
- [x] 2.3 Show unit cards for the selected course's modules above the path. Verified by: LearningJourney test with three modules.
- [x] 2.4 Loading, empty and error states for each new block. Verified by: tests that force each state and a retry.

## 3. Quality and accessibility

- [x] 3.1 Layout tests at 320, 360, 390, 430 px and 200 percent text scale for top bar, strip and hero. Verified by: Jest width tests; no clipped text assertions.
- [x] 3.2 Screen-reader names and 44 pt targets for bell, avatar and strip cards. Verified by: role and name queries in tests.

## 4. Specs, docs and release

- [x] 4.1 Update `openspec/config.yaml` context (brand no longer "white, black, blue; not dark") and `docs/10_DECISION_REGISTER.md`. Verified by: diff review.
- [ ] 4.2 Build the Android preview and iOS TestFlight; owner checks Home and Academy on device and reports. Verified by: owner screenshots recorded in the change; not claimed done without them.
- [ ] 4.3 Resolve the open questions in design.md with the owner, then archive the change.
