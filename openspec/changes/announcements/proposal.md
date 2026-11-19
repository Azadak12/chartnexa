# In-app announcements

## Why
Roadmap Phase 8 `announcements` (screens M12, A17, S17). Staff need to tell students about schedule changes and course news. Delivery channels beyond the app (email, push) are not decided, so this change is in-app only.

## What changes
- New permission `announcements:publish`, held by Admins and Managers (R39 proposal); not grantable to Instructors.
- API: post (plain text, to everyone or to one course's owners, idempotent by key), withdraw with a reason, staff list with read counts; readers' feed, unread count and mark-read.
- App: Announcements screen (from Profile and a home shortcut when something is unread); staff list, full-screen post form, withdraw sheet.

## Out of scope
Email or push delivery and their consent settings (owner decision on channels, docs/07 `notification_*`), scheduled posts, editing after posting (withdraw and post again), Instructor posting (would need a course-scoped permission; owner decision).
