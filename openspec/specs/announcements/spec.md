# announcements Specification

## Purpose
Lets Admins and Managers post plain-text announcements to everyone or one course's owners, and shows each person what is meant for them.

## Requirements

### Requirement: Staff publish announcements
Holders of `announcements:publish` SHALL post plain-text announcements to everyone or to one course's owners, with an idempotency key, and withdraw them with a reason. Others SHALL be refused with 403.

#### Scenario: Retried post
- **WHEN** a post is retried with the same key, including simultaneously
- **THEN** one announcement exists and every answer names it

#### Scenario: Repeat withdrawal
- **WHEN** a withdrawn announcement is withdrawn again
- **THEN** it is answered unchanged and one audit event exists

### Requirement: Readers see what is meant for them
A signed-in person SHALL see published announcements for everyone and for courses they have active access to, newest first, with read state and an unread count. Marking an announcement they cannot see SHALL answer 404.

#### Scenario: Revoked access
- **WHEN** access to the course is revoked
- **THEN** that course's announcements disappear from the feed
