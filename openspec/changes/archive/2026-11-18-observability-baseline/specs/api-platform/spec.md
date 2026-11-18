# Spec Delta

## MODIFIED Requirements

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
