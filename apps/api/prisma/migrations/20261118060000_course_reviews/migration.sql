-- AlterTable: stored rating totals, updated in the same transaction as every review change.
ALTER TABLE "courses" ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "courses" ADD COLUMN "rating_sum" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_user_id_course_id_key" ON "reviews"("user_id", "course_id");

-- CreateIndex: newest first, one page at a time.
CREATE INDEX "reviews_course_id_created_at_id_idx" ON "reviews"("course_id", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Second line of defense: the database refuses what the API would also refuse.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_body_length" CHECK (char_length("body") <= 1000);
ALTER TABLE "courses" ADD CONSTRAINT "courses_rating_count_not_negative" CHECK ("rating_count" >= 0);
-- Every rating is 1 to 5, so the sum of n ratings is between n and 5n.
ALTER TABLE "courses" ADD CONSTRAINT "courses_rating_sum_possible" CHECK ("rating_sum" BETWEEN "rating_count" AND 5 * "rating_count");
