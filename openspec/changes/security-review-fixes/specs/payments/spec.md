# Spec Delta

## ADDED Requirements

### Requirement: Paid events must state the exact amount
A `paid` event SHALL grant access only when it states an amount equal to the order's amount. A missing or different amount SHALL be recorded as `amount_mismatch` and change nothing.

#### Scenario: Amount left out
- **WHEN** a correctly signed paid event has no amount
- **THEN** the outcome is `amount_mismatch` and the buyer gets no access
