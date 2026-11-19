# Design
- **Visibility in one place:** `visibleTo(userId)` = published AND (no course OR the person has an active entitlement to the course). Feed, unread count and mark-read all use it; marking something you cannot see answers 404 so its existence stays private.
- **Plain text:** titles 3-120, bodies up to 4000 characters, rendered as text only; no markup or links are interpreted.
- **Idempotency:** unique (author, key). A retry answers the first announcement; a key reused for different text answers 409 `IDEMPOTENCY_KEY_REUSED`; simultaneous retries resolve through the unique index.
- **Withdraw:** row lock; repeating it answers the withdrawn announcement and records nothing. The reason goes to the audit log; readers see nothing.
- **Reads:** one row per person and announcement, inserted with `ON CONFLICT DO NOTHING`; deleted with the account.
- **Audit:** `announcement.publish` (audience, course, title, body length), `announcement.withdraw` (reason).
