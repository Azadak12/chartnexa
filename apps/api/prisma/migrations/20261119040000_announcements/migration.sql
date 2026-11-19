-- In-app announcements (R39). Plain text; academy-wide (course_id NULL) or for one course's owners.
CREATE TABLE "announcements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "course_id" UUID,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'published',
  "author_id" UUID,
  "idempotency_key" TEXT NOT NULL,
  "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "withdrawn_at" TIMESTAMPTZ(6),
  "withdraw_reason" TEXT,
  "withdrawn_by" UUID,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcements_course_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE,
  CONSTRAINT "announcements_author_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "announcements_withdrawer_fkey" FOREIGN KEY ("withdrawn_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "announcements_title_length" CHECK (char_length("title") BETWEEN 3 AND 120),
  CONSTRAINT "announcements_body_length" CHECK (char_length("body") BETWEEN 1 AND 4000),
  CONSTRAINT "announcements_status_known" CHECK ("status" IN ('published', 'withdrawn')),
  CONSTRAINT "announcements_withdraw_details" CHECK (
    ("status" = 'withdrawn') = ("withdrawn_at" IS NOT NULL AND "withdraw_reason" IS NOT NULL)
  ),
  CONSTRAINT "announcements_reason_length" CHECK (
    "withdraw_reason" IS NULL OR char_length("withdraw_reason") BETWEEN 3 AND 300
  )
);
-- A retry with the same key by the same author finds the first announcement.
CREATE UNIQUE INDEX "announcements_author_key" ON "announcements" ("author_id", "idempotency_key");
CREATE INDEX "announcements_feed_idx" ON "announcements" ("published_at" DESC, "id" DESC) WHERE "status" = 'published';
CREATE INDEX "announcements_course_idx" ON "announcements" ("course_id");

CREATE TABLE "announcement_reads" (
  "announcement_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id", "user_id"),
  CONSTRAINT "announcement_reads_announcement_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE,
  CONSTRAINT "announcement_reads_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "announcement_reads_user_idx" ON "announcement_reads" ("user_id");
