# Spec Delta

## ADDED Requirements

### Requirement: Students buy courses in test mode
The course page SHALL offer "Buy for <price>" with "Test mode: no money is charged" for priced courses the person does not own, "Finish your purchase" when a checkout is unfinished, and a note for free courses. A full-screen checkout SHALL offer paying, simulating a failure and cancelling, then lead to the course or offer Try again.

#### Scenario: Retry without duplicates
- **WHEN** starting a purchase fails and the person taps Buy again, or taps twice
- **THEN** the same request key is sent and only one checkout opens

#### Scenario: Reopened checkout
- **WHEN** the person returns to a finished checkout
- **THEN** it shows the result instead of the payment buttons

### Requirement: Students see their purchases
Profile SHALL offer Purchases, listing each order with its price and status in words, with empty, loading and error states.

#### Scenario: Reversed purchase
- **WHEN** a purchase was reversed
- **THEN** it reads "Payment reversed, access removed"
