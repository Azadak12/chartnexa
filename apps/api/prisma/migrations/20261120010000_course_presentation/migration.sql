-- The instructor shown on a course, and a real thumbnail image (bytes in object storage).
ALTER TABLE "courses" ADD COLUMN "instructor_id" UUID;
ALTER TABLE "courses" ADD COLUMN "thumbnail_id" UUID;
ALTER TABLE "courses" ADD COLUMN "thumbnail_mime" TEXT;
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_fkey"
  FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnail_pair" CHECK (
  ("thumbnail_id" IS NULL) = ("thumbnail_mime" IS NULL)
);
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnail_mime" CHECK (
  "thumbnail_mime" IS NULL OR "thumbnail_mime" IN ('image/png', 'image/jpeg', 'image/webp')
);
CREATE UNIQUE INDEX "courses_thumbnail_id_key" ON "courses" ("thumbnail_id");
CREATE INDEX "courses_instructor_idx" ON "courses" ("instructor_id");
