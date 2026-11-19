-- Uploads now serve files and videos; videos may be larger and have more parts.
ALTER TABLE "upload_sessions" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'resource';
ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_size";
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_size" CHECK (
  ("purpose" = 'resource' AND "size_bytes" BETWEEN 1 AND 52428800 AND "part_count" BETWEEN 1 AND 20)
  OR ("purpose" = 'video' AND "size_bytes" BETWEEN 1 AND 1073741824 AND "part_count" BETWEEN 1 AND 205)
);

-- At most one video per lesson. Bytes live with the video provider (test adapter: object storage).
CREATE TABLE "lesson_videos" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "status" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "size_bytes" INTEGER,
    "error_code" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_videos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lesson_videos_lesson_id_key" ON "lesson_videos"("lesson_id");
ALTER TABLE "lesson_videos" ADD CONSTRAINT "lesson_videos_lesson_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_videos" ADD CONSTRAINT "lesson_videos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lesson_videos" ADD CONSTRAINT "lesson_videos_status" CHECK ("status" IN ('processing', 'ready', 'failed'));
-- A ready video always has a length and a provider reference.
ALTER TABLE "lesson_videos" ADD CONSTRAINT "lesson_videos_ready" CHECK (
  "status" <> 'ready' OR ("duration_seconds" > 0 AND "provider_ref" IS NOT NULL)
);

-- How much of a lesson's video a person has watched, and where they stopped.
CREATE TABLE "video_progress" (
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "position_seconds" INTEGER NOT NULL DEFAULT 0,
    "watched_seconds" INTEGER NOT NULL DEFAULT 0,
    "last_beat_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_progress_pkey" PRIMARY KEY ("user_id", "lesson_id")
);
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_lesson_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_non_negative" CHECK ("position_seconds" >= 0 AND "watched_seconds" >= 0);
-- Prisma's one-to-one relation over (lesson_id, course_id) needs this pair to be unique too.
CREATE UNIQUE INDEX "lesson_videos_lesson_id_course_id_key" ON "lesson_videos"("lesson_id", "course_id");
