-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "is_preview" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_create_keys" (
    "course_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "lesson_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_create_keys_pkey" PRIMARY KEY ("course_id","key")
);

-- CreateIndex
CREATE INDEX "lesson_create_keys_created_at_idx" ON "lesson_create_keys"("created_at");

-- AddForeignKey: lessons never outlive their course.
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_create_keys" ADD CONSTRAINT "lesson_create_keys_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: a key disappears with its lesson, so a retry after a delete creates a new lesson.
ALTER TABLE "lesson_create_keys" ADD CONSTRAINT "lesson_create_keys_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Second line of defense: the database refuses what the API would also refuse.
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_title_length" CHECK (char_length("title") BETWEEN 1 AND 120);
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_body_length" CHECK (char_length("body") <= 20000);
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_position_range" CHECK ("position" BETWEEN 1 AND 200);
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_version_positive" CHECK ("version" >= 1);
ALTER TABLE "lesson_create_keys" ADD CONSTRAINT "lesson_create_keys_key_length" CHECK (char_length("key") BETWEEN 8 AND 100);

-- One lesson per position in a course. Deferred so a reorder can rewrite positions inside one
-- transaction; the check still runs at commit, so a duplicate can never be committed.
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_position_unique" UNIQUE ("course_id", "position") DEFERRABLE INITIALLY DEFERRED;
