-- CreateTable: ordered sections of a course. Lessons may belong to one.
CREATE TABLE "course_modules" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_title_length" CHECK (char_length("title") BETWEEN 1 AND 120);
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_position_range" CHECK ("position" BETWEEN 1 AND 50);
-- One module per position in a course; deferred so a reorder can rewrite positions in one transaction.
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_position_unique" UNIQUE ("course_id", "position") DEFERRABLE INITIALLY DEFERRED;
-- Lets lessons reference (id, course_id), so a lesson can only join a module of its own course.
CREATE UNIQUE INDEX "course_modules_id_course_id_key" ON "course_modules" ("id", "course_id");

-- AlterTable: a lesson belongs to at most one module of the same course. Deleting a module
-- leaves its lessons in the course without a module.
ALTER TABLE "lessons" ADD COLUMN "module_id" UUID;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_same_course_fkey" FOREIGN KEY ("module_id", "course_id") REFERENCES "course_modules"("id", "course_id") ON DELETE SET NULL ("module_id") ON UPDATE CASCADE;
CREATE INDEX "lessons_module_id_idx" ON "lessons" ("module_id");
