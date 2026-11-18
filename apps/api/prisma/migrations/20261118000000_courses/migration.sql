-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "CourseTone" AS ENUM ('blue', 'black', 'tint');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "level" "CourseLevel" NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "cover_tone" "CourseTone" NOT NULL DEFAULT 'blue',
    "status" "CourseStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_status_published_at_id_idx" ON "courses"("status", "published_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "courses_updated_at_id_idx" ON "courses"("updated_at" DESC, "id" DESC);


-- Second line of defense: the database refuses values the API would also refuse.
ALTER TABLE "courses" ADD CONSTRAINT "courses_price_range" CHECK ("price_cents" BETWEEN 0 AND 1000000);
ALTER TABLE "courses" ADD CONSTRAINT "courses_title_length" CHECK (char_length("title") BETWEEN 3 AND 120);
ALTER TABLE "courses" ADD CONSTRAINT "courses_version_positive" CHECK ("version" >= 1);
ALTER TABLE "courses" ADD CONSTRAINT "courses_published_has_time" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);
