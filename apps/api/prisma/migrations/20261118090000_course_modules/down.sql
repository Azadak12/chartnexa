DROP INDEX "lessons_module_id_idx";
ALTER TABLE "lessons" DROP CONSTRAINT "lessons_module_same_course_fkey";
ALTER TABLE "lessons" DROP COLUMN "module_id";
DROP TABLE "course_modules";
