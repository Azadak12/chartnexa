# Spec Delta

## ADDED Requirements

### Requirement: No route is public without review
An automated test SHALL list every API route and fail when a route without any guard is not on the reviewed public list, when a `/staff` route lacks authentication and a permission check, or when a `/me` route lacks authentication.

#### Scenario: New unguarded route
- **WHEN** a developer adds a route without a guard
- **THEN** the test fails until the route is reviewed and listed, or guarded
