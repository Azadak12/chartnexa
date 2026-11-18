# Tasks

- [x] 1.1 Migration with `down.sql` (table, composite FK, deferred unique positions); verify the round trip.
- [x] 1.2 Contracts (modules, `moduleId` on lessons, outline with modules, create into a module).
- [x] 1.3 Service and endpoints with the renumbering invariant, audit and permission checks; verify 10 integration tests including simultaneous changes and Continue following the grouped order.
- [x] 1.4 App: headings on the course page, Modules section and Module picker on the staff screen; verify 8 component tests.
- [x] 1.5 Contract test against the real API; CI route check.
- [x] 1.6 Mutation checks and full checks; archive after CI passes.

## Evidence

- Process note: specs written alongside the implementation under the owner's autonomous-work instruction.
- Full local checks (step by step): lint, format, builds, typecheck, 459 API tests (10 new), 435 app tests (8 new), 36 contract tests (1 new), builds, secrets, migration round trip: all pass.
- Found by the new tests and fixed: a lesson added without a module landed after module lessons, breaking the grouped order; every lesson create now renumbers.
- Two existing lesson tests listed exact response keys and were extended with `moduleId` (an added field, not a change in behaviour).
- Mutation checks, all caught: renumber ignoring module order; moved lesson not placed last; lesson reorder not regrouping; a module of another course accepted; module delete leaving gaps; module reorder accepting duplicates; no module limit; no course lock on module create; rename ignoring the version.
- Not verified: on devices (heading order with a screen reader, long module titles at large text).
