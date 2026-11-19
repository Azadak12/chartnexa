DROP INDEX "courses_instructor_idx";
DROP INDEX "courses_thumbnail_id_key";
ALTER TABLE "courses" DROP CONSTRAINT "courses_thumbnail_mime";
ALTER TABLE "courses" DROP CONSTRAINT "courses_thumbnail_pair";
ALTER TABLE "courses" DROP CONSTRAINT "courses_instructor_fkey";
ALTER TABLE "courses" DROP COLUMN "thumbnail_mime";
ALTER TABLE "courses" DROP COLUMN "thumbnail_id";
ALTER TABLE "courses" DROP COLUMN "instructor_id";
