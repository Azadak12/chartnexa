# mobile-announcements Specification

## Purpose
The app's announcements feed and home shortcut, and the staff screens to post and withdraw.

## Requirements

### Requirement: Readers open announcements in the app
Profile SHALL offer Announcements; home SHALL show "N new announcements" when something is unread. Opening an announcement SHALL show its text and mark it read once. Loading, empty, error with Retry and paging SHALL be handled.

#### Scenario: Nothing unread
- **WHEN** nothing is unread
- **THEN** home shows no shortcut

### Requirement: Staff post and withdraw in the app
People with the permission SHALL see read counts, post through a full-screen form choosing everyone or one course, and withdraw through a sheet that asks for a reason. Retries of one draft SHALL send the same key.

#### Scenario: Lost answer
- **WHEN** posting fails on the network and the person taps Post again
- **THEN** the same key is sent and at most one announcement is created
