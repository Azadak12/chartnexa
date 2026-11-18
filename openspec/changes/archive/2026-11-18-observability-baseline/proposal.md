# Proposal

## Why

The roadmap puts `observability-baseline` before the complex integrations (files, video, payments), so failures in those can be found and diagnosed. An audit of the current logging found two real privacy defects:

- Request logs contain full URLs including the query string, so `GET /staff/users/lookup?email=…` writes an email address, and catalog searches write the search terms (verified with a probe test).
- Unexpected errors are logged as raw exceptions. Database errors can carry the values of a query (for example an email) in their message.

There are also no metrics, no error classification and no trace correlation beyond the request id.

## What Changes

- **Fix the leaks:** request logs show the path and query parameter *names* only; unexpected errors are logged by type, code and stack frames, never by message. More secret field names are redacted (recovery codes, two-step codes, new and current passwords).
- **Error classification:** every 5xx log line carries `errorClass` (`dependency` for database or network failures, `server` otherwise), and every completed request is counted by status class.
- **Metrics:** an in-process registry with request counts and durations (labelled by route pattern, never by raw URL), process memory, uptime and event-loop delay, served as Prometheus text at `GET /metrics`. In production it answers only with `METRICS_TOKEN` (bearer); without a token configured it is off in production.
- **Trace correlation:** a valid W3C `traceparent` header is read and its trace id written to every log line of that request; otherwise a new trace id is made. No tracing SDK is added yet (decision Q30).
- **Error reporting boundary:** an `ErrorReporter` interface with a logging implementation, used for every unexpected error, so an external service can be added later without touching call sites (Q31).
- **Alerting:** Prometheus alert rules and an operations runbook in `ops/observability/`, with what each alert means and what to check first.
- **Not included:** a hosted error-tracking or tracing vendor, dashboards, log shipping, background-job monitoring (there are no background jobs yet), mobile crash reporting.

## Confirmation status

Engineering baseline approved under the owner's standing instruction to make routine engineering decisions (2026-11-18). The choice of an external error-tracking or tracing service is recorded as pending (Q30, Q31).

## Capabilities

### New Capabilities
- `observability`: metrics, error classification, trace correlation, error reporting boundary.

### Modified Capabilities
- `api-platform`: log redaction now covers URLs and error messages.

## Impact

- API platform code only (`src/platform`, the app factory, config); new optional variable `METRICS_TOKEN`.
- No database change. No new dependencies.
