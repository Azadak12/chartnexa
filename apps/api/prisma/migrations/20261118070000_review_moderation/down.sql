-- Hidden reviews are not counted in the totals, so they are counted again before the column goes.
UPDATE "courses" c SET "rating_count" = c."rating_count" + h.n, "rating_sum" = c."rating_sum" + h.s
FROM (SELECT "course_id", COUNT(*)::int AS n, SUM("rating")::int AS s FROM "reviews" WHERE "hidden_at" IS NOT NULL GROUP BY "course_id") h
WHERE c."id" = h."course_id";
DROP TABLE "review_appeals";
DROP TABLE "review_reports";
DROP INDEX "reviews_course_id_visible_idx";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_hidden_note_length";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_hidden_reason_known";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_hidden_together";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_hidden_by_fkey";
ALTER TABLE "reviews" DROP COLUMN "hidden_note";
ALTER TABLE "reviews" DROP COLUMN "hidden_reason";
ALTER TABLE "reviews" DROP COLUMN "hidden_by";
ALTER TABLE "reviews" DROP COLUMN "hidden_at";
