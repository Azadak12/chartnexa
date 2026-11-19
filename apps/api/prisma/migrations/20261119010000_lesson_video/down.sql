DROP TABLE "video_progress";
DROP TABLE "lesson_videos";
DELETE FROM "upload_sessions" WHERE "purpose" = 'video';
ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_size";
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_size" CHECK ("size_bytes" BETWEEN 1 AND 52428800 AND "part_count" BETWEEN 1 AND 20);
ALTER TABLE "upload_sessions" DROP COLUMN "purpose";
