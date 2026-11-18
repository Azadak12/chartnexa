DROP TABLE "reviews";
ALTER TABLE "courses" DROP CONSTRAINT "courses_rating_sum_possible";
ALTER TABLE "courses" DROP CONSTRAINT "courses_rating_count_not_negative";
ALTER TABLE "courses" DROP COLUMN "rating_sum";
ALTER TABLE "courses" DROP COLUMN "rating_count";
