# Course content management (Instructor and Lecturer)

Status: working and covered by automated tests, including a test that runs the real routes against a real database. **Not verified on a physical Android phone.**

## What an Instructor or Lecturer can do, and where

Manage Courses (or Your courses on the dashboard) shows each course they teach. A course with a lesson grant shows **Lessons & files**, and one with a live grant shows **Live classes**, directly on the card. The same screens are reached from the course edit page (**Lessons, videos and files**, **Live classes**).

- **Modules and lessons:** add, rename, reorder and delete modules; add, edit, reorder and delete lessons; move a lesson into or out of a module (Module button). Text lessons and a free-preview switch.
- **Videos:** open a lesson, then **Add video**, **Replace video** or **Remove video**. The lesson must be saved first. MP4 only, up to 1 GB, checked before sending ("Use an MP4 video", "Videos can be up to 1 GB", "This video is empty"). The upload runs in parts with a percentage, a **Cancel** button, automatic retry of dropped parts and **Try the video upload again**.
- **PDFs and other materials:** in the same lesson, **Add file**: PDF, PNG, JPEG, WebP, Word (.docx) or plain text, with a title and a downloadable switch; replace, rename, remove. Wrong types and empty or oversized files are refused with a plain message; the server also checks the real file contents.
- **Live classes:** **Schedule a class** (title, date, time, length, and the meeting link from Zoom, Google Meet or similar), edit, cancel with a reason students see, and **Start class**, which opens your meeting room in the browser. The list shows how many students joined.

## What Students see

A Student who owns the course watches the lesson video (ranged streaming, progress saved), opens the lesson's files, and sees upcoming live classes with a **Join** button that opens from 15 minutes before the start. Free-preview lessons are open to everyone; paid lessons, their files and videos return "no access" for people who do not own the course.

## Permissions

Everything is checked on the server per course. The Instructor has grants on five courses and the Lecturer on two; the Lecturer gets 403 on every content route of the other three (lessons, modules, uploads, video, live classes). Students and signed-out requests get 403 or 401 on staff routes.

## What this is not

Live classes use **your own meeting link**. ChartNexa does not host video calls itself, and there is no in-app broadcast, recording or attendance beyond the join count. Video storage is local disk with a test video adapter (no transcoding or adaptive streaming), which production refuses until a hosted video provider is chosen (decision Q09).
