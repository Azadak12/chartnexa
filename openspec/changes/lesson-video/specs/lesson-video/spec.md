# Spec Delta

## ADDED Requirements

### Requirement: Staff attach one MP4 video to a lesson
A person allowed to author a course's lessons SHALL upload an MP4 of up to 1 GB in parts as the lesson's video. The provider SHALL check it and record its length; a refused file SHALL leave any earlier video in place.

#### Scenario: Upload
- **WHEN** all parts are sent and the upload is completed
- **THEN** the lesson has a ready video with its length, the parts are removed and the change is audited; completing again returns the same video

#### Scenario: Not a usable MP4
- **WHEN** the file is not an MP4 or its length cannot be read
- **THEN** completion answers a field error on `file` and the earlier video stays

#### Scenario: Replace and remove
- **WHEN** staff replace or remove the video
- **THEN** the old bytes and everyone's watch progress for it are removed, completions stay, and removing again succeeds

#### Scenario: Permission and limits
- **WHEN** a Student or an Instructor without a lesson grant tries, or the file is not .mp4 or over 1 GB
- **THEN** the request is refused with 403 or 400

### Requirement: Viewers play videos through signed links
Anyone who may read the lesson SHALL get its ready video with a signed playback link; the test adapter SHALL serve the bytes with HTTP ranges and refuse invalid or expired links.

#### Scenario: Range playback
- **WHEN** a player asks for a byte range
- **THEN** it receives 206 with the matching Content-Range, and 416 for a range outside the file

#### Scenario: Locked lesson
- **WHEN** someone who may not read the lesson asks for its video
- **THEN** the answer is 403

### Requirement: Watching completes a video lesson
Owners SHALL report watching. Credited time SHALL never grow faster than twice real time plus a small slack, never exceed the video's length, and stay correct when reports arrive together. At the configured share (90 percent by default) the lesson SHALL be completed once.

#### Scenario: Inflated reports
- **WHEN** reports claim more time than has passed
- **THEN** only the capped time is credited and the lesson is not completed early

#### Scenario: Completion
- **WHEN** an owner has watched 90 percent
- **THEN** the lesson is complete in course progress, and later reports change nothing

#### Scenario: Manual mark
- **WHEN** an owner tries to mark a video lesson complete by hand
- **THEN** the answer is 409 `VIDEO_LESSON`; undoing a completion still works

#### Scenario: Not an owner
- **WHEN** someone without access reports watching
- **THEN** the answer is 403 and nothing is stored
