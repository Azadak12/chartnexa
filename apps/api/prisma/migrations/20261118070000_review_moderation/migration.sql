-- Moderation state on a review. A hidden review keeps its text; it only leaves public lists and
-- the rating totals. All four columns are set together or all are empty.
ALTER TABLE "reviews" ADD COLUMN "hidden_at" TIMESTAMPTZ(6);
ALTER TABLE "reviews" ADD COLUMN "hidden_by" UUID;
ALTER TABLE "reviews" ADD COLUMN "hidden_reason" TEXT;
ALTER TABLE "reviews" ADD COLUMN "hidden_note" TEXT;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- The hider may disappear later (hidden_by becomes empty); the rest stays together.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_together" CHECK (
  ("hidden_at" IS NULL AND "hidden_by" IS NULL AND "hidden_reason" IS NULL AND "hidden_note" IS NULL)
  OR ("hidden_at" IS NOT NULL AND "hidden_reason" IS NOT NULL AND "hidden_note" IS NOT NULL)
);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_reason_known" CHECK (
  "hidden_reason" IS NULL OR "hidden_reason" IN ('spam', 'abusive', 'personal_info', 'off_topic', 'other')
);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_note_length" CHECK ("hidden_note" IS NULL OR char_length("hidden_note") <= 500);

-- Public lists read only visible reviews.
CREATE INDEX "reviews_course_id_visible_idx" ON "reviews"("course_id", "created_at" DESC, "id" DESC) WHERE "hidden_at" IS NULL;

-- CreateTable
CREATE TABLE "review_reports" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reason_known" CHECK ("reason" IN ('spam', 'abusive', 'personal_info', 'off_topic', 'other'));
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_note_length" CHECK (char_length("note") <= 300);
-- One open report per person and review; after a moderator acts, the person may report again.
CREATE UNIQUE INDEX "review_reports_open_unique" ON "review_reports"("review_id", "reporter_id") WHERE "resolved_at" IS NULL;
CREATE INDEX "review_reports_review_id_idx" ON "review_reports"("review_id");
CREATE INDEX "review_reports_reporter_id_idx" ON "review_reports"("reporter_id");

-- CreateTable
CREATE TABLE "review_appeals" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "hidden_at" TIMESTAMPTZ(6) NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "decided_by" UUID,
    "decided_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "review_appeals_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "review_appeals" ADD CONSTRAINT "review_appeals_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_appeals" ADD CONSTRAINT "review_appeals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "review_appeals" ADD CONSTRAINT "review_appeals_status_known" CHECK ("status" IN ('open', 'upheld', 'overturned'));
ALTER TABLE "review_appeals" ADD CONSTRAINT "review_appeals_decided_together" CHECK (("status" = 'open') = ("decided_at" IS NULL));
ALTER TABLE "review_appeals" ADD CONSTRAINT "review_appeals_message_length" CHECK (char_length("message") BETWEEN 1 AND 500);
ALTER TABLE "review_appeals" ADD CONSTRAINT "review_appeals_note_length" CHECK ("decided_note" IS NULL OR char_length("decided_note") <= 500);
-- One appeal per hiding: the hiding is identified by the time it happened.
CREATE UNIQUE INDEX "review_appeals_review_id_hidden_at_key" ON "review_appeals"("review_id", "hidden_at");
CREATE INDEX "review_appeals_open_idx" ON "review_appeals"("created_at" DESC, "id" DESC) WHERE "status" = 'open';
