# Spec Delta

## ADDED Requirements

### Requirement: Students watch lesson videos
The lesson reader SHALL show the video with native controls (play, pause, seek, fullscreen with landscape), speed choices, the length in words, where it continues from, watched percent and completion, with loading, buffering, error and retry states.

#### Scenario: Resume
- **WHEN** an owner returns to a video they started
- **THEN** the player starts where they stopped and says "Continues from m:ss"

#### Scenario: Reporting
- **WHEN** the video plays
- **THEN** the app reports every 15 seconds and on leaving, counts only forward playback, and keeps unsent time after a failed report

#### Scenario: Playback error
- **WHEN** playback fails
- **THEN** the app explains it and Try again restarts the player with a fresh link

### Requirement: Staff manage a lesson's video
The lesson form SHALL let staff add, replace and remove the video with checks before upload, progress, cancel and retry.

#### Scenario: Retry
- **WHEN** an upload fails
- **THEN** the reason is shown and "Try the video upload again" resends the same file
