# Spec Delta

## ADDED Requirements

### Requirement: Buyers start one checkout per course
A signed-in person SHALL start buying a published, priced course with an Idempotency-Key. Repeating the key SHALL return the same order; an unfinished checkout SHALL be returned instead of a new one; owned and free courses SHALL be refused.

#### Scenario: Repeat and race
- **WHEN** the same request is retried, or several are sent at once
- **THEN** exactly one pending order exists and every answer names it

#### Scenario: Key reused for something else
- **WHEN** a key is reused for a different course
- **THEN** the answer is 409 `IDEMPOTENCY_KEY_REUSED`

#### Scenario: Not purchasable
- **WHEN** the person already has the course, it is free, unpublished or unknown
- **THEN** the answer is 409 `ALREADY_OWNED`, 409 `COURSE_FREE` or 404

### Requirement: Provider events change orders exactly once
Signed provider events SHALL be stored once per provider and event id and applied by a state machine under a lock on the order. Access SHALL be granted only by a payment and removed by a reversal.

#### Scenario: Duplicate event (S1)
- **WHEN** the same payment event arrives several times, or different events for the same payment arrive at once
- **THEN** exactly one access exists and repeats answer the first outcome

#### Scenario: No payment, no access (S2)
- **WHEN** a checkout fails or is cancelled
- **THEN** there is no access, and buying again starts a new checkout

#### Scenario: Out of order
- **WHEN** a failure arrives after a payment
- **THEN** it is ignored; a payment arriving after a failure still gives access

#### Scenario: Reversal (N01)
- **WHEN** a paid order is reversed, and later the dispute is won
- **THEN** access is removed, then given back

#### Scenario: Wrong amount, bad signature, unknown order
- **WHEN** an event has the wrong amount, an invalid signature or names no order
- **THEN** it gives no access (and a bad signature answers 401)

#### Scenario: Already owned at payment time
- **WHEN** a payment arrives for a course the person already has
- **THEN** the order becomes `duplicate_needs_refund` and no second access is created

### Requirement: Test mode only
Only the test provider SHALL exist; production configuration SHALL refuse it, and every order SHALL say it is in test mode.

#### Scenario: Production
- **WHEN** the API starts in production with the test provider
- **THEN** it refuses to start, naming `PAYMENT_PROVIDER`

### Requirement: Purchase history
Buyers SHALL see their own orders newest first; staff with payment status permission SHALL see orders by status; nobody else SHALL.

#### Scenario: Someone else's order
- **WHEN** a person asks for another person's order
- **THEN** the answer is 404
