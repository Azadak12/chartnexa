DROP INDEX "courses_category_published_idx";
ALTER TABLE "courses" DROP CONSTRAINT "courses_category_id_fkey";
ALTER TABLE "courses" DROP COLUMN "category_id";
DROP TABLE "categories";
