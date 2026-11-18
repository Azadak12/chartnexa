# Tasks

## 1. Server

- [x] 1.1 Request serializer without query values and the extra redaction paths; verify tests that a lookup email, search terms and two-step codes never reach the logs.
- [x] 1.2 Safe error serializer and classification; verify unit tests for Prisma connection codes, network errors and plain errors, and that messages never appear.
- [x] 1.3 ErrorReporter provider used by the error filter; verify it is called once per 5xx and never for 4xx.
- [x] 1.4 Metrics registry, request hooks with route patterns, process gauges and `/metrics` with production token rules; verify unit tests for the text format and integration tests for counting and access.
- [x] 1.5 Trace id from `traceparent` or generated, logged and returned; verify tests for valid, malformed and missing headers.

## 2. Operations

- [x] 2.1 Alert rules and runbook in `ops/observability/`; verify a test that parses the rules and checks each runbook anchor exists.
- [x] 2.2 Document variables and endpoints in the API README and `.env.example`; record Q30 and Q31.

## 3. Closing

- [x] 3.1 Mutation checks on the query redaction, error message stripping, route labelling and the production token rule; record results.
- [x] 3.2 Run the full checks and `openspec validate observability-baseline`; CI on `main` passed (run 76, `416e42a`), then archived.

## Evidence

- Found by a probe test before the change: request logs contained `"url":"/staff/users/lookup?email=probe-leak%40example.com"` and catalog search terms; unexpected errors were logged with their message (the test route's `password=hunter2` text). All three are now covered by tests.
- Full local run (step by step; Turbo does not start here): lint, format, builds, typecheck, 438 API tests (22 new: unit tests for URL redaction, error classification, trace ids, metrics text and access, alert rules; integration tests for log content, error reporting, trace propagation and route labels), 420 app tests, 34 contract tests, API and app builds, secrets scan, migration round trip: all pass.
- An existing log-hygiene test lists every allowed log field; `traceId` (random, no personal data) was added to it.
- Mutation checks, all caught: query values kept in logged URLs; error messages logged; raw URL used as route label; `/metrics` open in production without a token; dependency errors classified as server; 4xx reported as errors.
- Not verified: the alert rules in a running Prometheus (checked structurally only), metrics under real load, behaviour behind a production proxy.
