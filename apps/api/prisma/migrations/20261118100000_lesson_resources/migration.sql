-- Files attached to lessons. Bytes live in object storage under a server-generated key.
CREATE TABLE "lesson_resources" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "scan_status" TEXT NOT NULL,
    "downloadable" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_resources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lesson_resources_storage_key_key" ON "lesson_resources"("storage_key");
CREATE INDEX "lesson_resources_lesson_idx" ON "lesson_resources"("lesson_id", "created_at", "id");
-- A resource belongs to a lesson of the same course; deleting the lesson deletes its resources
-- (the bytes are removed by the cleanup sweep).
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_title_length" CHECK (char_length("title") BETWEEN 1 AND 120);
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_file_name_length" CHECK (char_length("file_name") BETWEEN 1 AND 120);
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_size" CHECK ("size_bytes" BETWEEN 1 AND 52428800);
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_scan_status" CHECK ("scan_status" IN ('clean', 'not_scanned'));
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- An upload in progress: parts are stored separately and assembled on completion.
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "created_by" UUID,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "part_size" INTEGER NOT NULL,
    "part_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resource_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_lesson_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_status" CHECK ("status" IN ('open', 'completed', 'cancelled'));
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_size" CHECK ("size_bytes" BETWEEN 1 AND 52428800 AND "part_count" BETWEEN 1 AND 20);
CREATE INDEX "upload_sessions_open_expiry_idx" ON "upload_sessions"("expires_at") WHERE "status" = 'open';
