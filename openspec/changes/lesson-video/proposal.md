# Proposal

## Why

Workstream D of the owner's master prompt: recorded video lessons with protected playback, resume, progress and the 90 percent completion rule, while no video provider is chosen (Q09). This change builds the provider-neutral parts and a clearly labelled test adapter; production refuses the adapter.

## What Changes

- **Upload:** staff who may author the course's lessons upload one MP4 (up to 1 GB) per lesson in 5 MB parts, reusing the upload sessions of `lesson-resources` (now with a purpose: file or video). Parts are joined in storage by streaming. The provider takes the file; the test adapter checks it is an MP4 and reads its length from the movie header. A refused file leaves an earlier video in place. Replacing a video removes the old bytes and restarts everyone's watching; completions already earned stay.
- **Provider boundary:** `VideoProvider` (ingest, playback path, remove) with `TestVideoProvider`: no transcoding, no adaptive streaming, serves the MP4 with HTTP ranges. `VIDEO_PROVIDER=test` is refused in production.
- **Playback:** anyone who may read the lesson gets the ready video with a signed playback link valid for hours (`VIDEO_LINK_TTL_SECONDS`, default 4 h, because players fetch ranges throughout); invalid or expired links answer 404, ranges outside the file 416.
- **Progress and completion:** owners report position and seconds played; the server caps credited time by real elapsed time (up to 2x speed plus 5 s), never beyond the video's length, under a row lock. At `VIDEO_COMPLETION_PERCENT` (default 90, Q07 proposal) the lesson is completed once, in the existing completion table, so course progress and Continue follow. A lesson with a video can no longer be marked complete by hand (`VIDEO_LESSON`); undoing still works.
- **App:** the lesson reader shows the video with native controls (play, pause, seek, fullscreen and landscape), speed chips (1x to 2x), "Continues from m:ss", watched percent, completion announcement, buffering and error states with Try again; reports every 15 seconds and on leaving, keeping unsent time after a failed report. Staff add, replace and remove the video on the lesson form with progress, cancel and retry.
- **Not included:** a production video provider, adaptive (HLS) streaming, captions, offline downloads, DRM.

## Confirmation status

Built under the owner's standing instruction. The 90 percent rule is Q07's proposal (R18 deferred it to video) and is configurable; manual marking for video lessons is refused per that proposal. Recorded as R36 pending confirmation. Provider: Q09 still open.

## Capabilities

### New Capabilities
- `lesson-video`, `mobile-lesson-video`.

## Impact

- Tables `lesson_videos`, `video_progress`; `upload_sessions.purpose`. Config `VIDEO_PROVIDER`, `VIDEO_LINK_TTL_SECONDS`, `VIDEO_COMPLETION_PERCENT`. App dependency `expo-video` 58.0.14 (first-party, MIT).
