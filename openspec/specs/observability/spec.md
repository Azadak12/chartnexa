# observability Specification

## Purpose
Structured, redacted logs, request ids, metrics and alert rules for operating the API.

## Requirements

### Requirement: Unexpected errors are classified and reported
Every unexpected (5xx) error SHALL be logged once with a classification (`dependency` or `server`), the request id and the trace id, and passed to the error reporter. Client errors (4xx) SHALL NOT be reported as errors.

#### Scenario: Database unavailable
- **WHEN** a request fails because the database cannot be reached
- **THEN** the log line has `errorClass` `dependency` and the client gets the standard 5xx envelope

#### Scenario: Bug in a handler
- **WHEN** a handler throws an unexpected error
- **THEN** the log line has `errorClass` `server`, the reporter receives it once, and the response reveals nothing internal

#### Scenario: Client error
- **WHEN** a request fails validation or permission checks
- **THEN** nothing is reported as an error

### Requirement: Operational metrics are available
The API SHALL expose request counts and durations by method, route pattern and status class, plus process memory, uptime and event-loop delay, in Prometheus text format at `/metrics`.

#### Scenario: Counting requests
- **WHEN** requests are served
- **THEN** the counters increase under the route pattern, never the raw URL, so ids and query values never become labels

#### Scenario: Production access
- **WHEN** the API runs in production
- **THEN** `/metrics` answers 404 without a configured token, 401 with a wrong token, and the metrics with the right one

### Requirement: Requests carry a trace id
Every request SHALL have a trace id, taken from a valid W3C `traceparent` header or generated, written on every log line of that request and returned in `x-trace-id`.

#### Scenario: Incoming trace context
- **WHEN** a request carries a valid `traceparent`
- **THEN** its trace id appears in the request's log lines and the response header

#### Scenario: Invalid trace context
- **WHEN** the header is malformed or all zeros
- **THEN** it is ignored and a new trace id is generated

### Requirement: Alerts and a runbook exist
The repository SHALL contain alert rules for high error rate, dependency failures, slow responses and the service being down, each with a runbook entry.

#### Scenario: Rules are valid
- **WHEN** the rules file is parsed
- **THEN** every rule has an expression, a duration, a severity and a runbook link that exists
