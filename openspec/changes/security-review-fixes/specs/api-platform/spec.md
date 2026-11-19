# Spec Delta

## ADDED Requirements

### Requirement: Default security headers
Every API answer SHALL carry `cache-control: no-store`, `x-content-type-options: nosniff`, `content-security-policy: default-src 'none'; frame-ancestors 'none'`, `referrer-policy: no-referrer` and `x-frame-options: DENY`, except where a route sets its own caching or content policy.

#### Scenario: Error answer
- **WHEN** a request fails validation or matches no route
- **THEN** the answer still carries the default headers
