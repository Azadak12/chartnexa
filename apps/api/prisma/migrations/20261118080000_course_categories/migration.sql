-- CreateTable: academy-wide course categories, managed by staff.
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
-- Names are unique regardless of letter case ("Forex" and "forex" are the same category).
CREATE UNIQUE INDEX "categories_name_lower_key" ON "categories" (lower("name"));
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_length" CHECK (char_length("name") BETWEEN 2 AND 40);
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_trimmed" CHECK ("name" = btrim("name"));

-- AlterTable: one optional category per course. RESTRICT: a category in use cannot be deleted.
ALTER TABLE "courses" ADD COLUMN "category_id" UUID;
ALTER TABLE "courses" ADD CONSTRAINT "courses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Catalog filter by category, newest published first.
CREATE INDEX "courses_category_published_idx" ON "courses" ("category_id", "published_at" DESC, "id" DESC) WHERE "status" = 'published';
