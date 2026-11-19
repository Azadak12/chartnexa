# Design

1. **Reuse uploads:** the same part endpoint serves files and videos; `purpose` keeps the two completion endpoints apart (each refuses the other's sessions) and sets different limits (CHECK in the migration).
2. **No full buffering:** `ObjectStorage.compose` streams parts into one object; the MP4 reader walks top-level boxes with small range reads, finds `moov/mvhd` (versions 0 and 1, 64-bit sizes) wherever it is, and stops safely on boxes that claim more than the file.
3. **Anti-inflation:** each report adds `min(claimed, ceil(elapsed * 2) + 5)` seconds, where elapsed is measured by the database since the previous report, capped at the duration. A `FOR UPDATE` lock serializes reports so simultaneous ones neither double count nor lose time.
4. **Completion:** the same `lesson_completions` row as text lessons (idempotent insert), so course counts, Continue and My Courses need no change.
5. **App player:** `NativePlayer` wraps `expo-video` (`useVideoPlayer`, `VideoView` with native controls and fullscreen) and only reports ticks and status, so screens are tested with a fake player. Watching is counted from forward ticks of at most 3 s; seeks do not count.
