# api-platform Specification

## Purpose
Defines the cross-cutting behavior every ChartNexa API endpoint shares: health reporting, consistent errors, request tracing, input validation, safe configuration and list pagination.

## Requirements

### Requirement: Liveness and readiness endpoints
The API SHALL expose unauthenticated liveness and readiness endpoints that reveal no secrets or internal details.

#### Scenario: Healthy service
- **WHEN** a client requests liveness and readiness while the database is reachable
- **THEN** both return success with a minimal status body

#### Scenario: Database down
- **WHEN** the database is unreachable and a client requests readiness
- **THEN** readiness returns a non-success status using the error envelope, and liveness still returns success

### Requirement: Uniform error envelope
Every API error response SHALL use one JSON shape containing a stable error code, a human-readable message, the request ID and optional per-field details, and SHALL NOT expose stack traces, SQL or internal paths.

#### Scenario: Unknown route
- **WHEN** a client requests a route that does not exist
- **THEN** the response is a 404 in the error envelope with the request ID

#### Scenario: Unhandled server error
- **WHEN** an unexpected exception occurs in a handler
- **THEN** the response is a 500 in the error envelope with a generic message and no internal details, and the full error is logged with the same request ID

### Requirement: Request ID propagation
The API SHALL give every request an ID, return it in a response header, and include it in logs and error bodies.

#### Scenario: Client supplies a valid ID
- **WHEN** a request carries a well-formed request ID header
- **THEN** the same ID is returned in the response header and used in logs

#### Scenario: Missing or malformed ID
- **WHEN** the header is absent or malformed (oversized or containing unsafe characters)
- **THEN** the API generates a new ID and does not echo the malformed value

### Requirement: Input validation at the boundary
The API SHALL validate request bodies, parameters and query strings, and SHALL reject invalid or unexpected input before any business logic runs.

#### Scenario: Invalid payload
- **WHEN** a request body fails validation
- **THEN** the response is a 400 in the error envelope listing each failing field and reason

#### Scenario: Unknown properties
- **WHEN** a request body contains properties the endpoint does not define
- **THEN** the request is rejected rather than silently accepted

### Requirement: Startup configuration validation
The API SHALL validate its configuration at startup and SHALL refuse to start when required settings are missing or invalid, without printing secret values.

#### Scenario: Missing required setting
- **WHEN** a required environment variable is missing at startup
- **THEN** the process exits with a nonzero code and a message naming the variable but not any secret value

### Requirement: Cursor pagination convention
List endpoints built on the shared convention SHALL use an opaque cursor, a bounded page size and a stable total ordering.

#### Scenario: Page size over the cap
- **WHEN** a client requests a limit above the maximum
- **THEN** the API returns at most the maximum or rejects with a validation error, never an unbounded list

#### Scenario: Stable paging under inserts
- **WHEN** new rows are inserted between two page requests
- **THEN** following the cursor returns neither duplicates nor skipped rows from the original ordering

#### Scenario: Tampered cursor
- **WHEN** a client sends a malformed or tampered cursor
- **THEN** the API responds with a 400 in the error envelope

### Requirement: Sensitive data redacted from logs
API logs SHALL be structured and SHALL redact credentials, tokens, authorization headers and personal data, including values in URL query strings and in the messages of unexpected errors.

#### Scenario: Authorization header present
- **WHEN** a request with an Authorization header is logged
- **THEN** the header value does not appear in any log output

#### Scenario: Personal data in a query string
- **WHEN** a request such as a user lookup by email or a catalog search is logged
- **THEN** the log shows the path and the parameter names but none of the values

#### Scenario: Unexpected error carrying data
- **WHEN** an unexpected error whose message contains an email address or other value is logged
- **THEN** the log shows its type, code and stack frames but not its message

### Requirement: Generated API documentation
The API SHALL publish a machine-readable OpenAPI description of its endpoints in development and test environments.

#### Scenario: Documentation matches endpoints
- **WHEN** the OpenAPI document is generated
- **THEN** it lists the health endpoints and the error envelope schema
