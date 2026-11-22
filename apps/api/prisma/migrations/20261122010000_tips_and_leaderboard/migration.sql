-- Trading Tip of the Day: staff-written educational tips. The tip shown on a day is chosen from
-- the active tips by the UTC date (see TipsService), so no per-user or per-render state is stored.
CREATE TABLE "daily_tips" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "category" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "course_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'active',
  "author_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "archived_at" TIMESTAMPTZ(6),
  CONSTRAINT "daily_tips_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_tips_category" CHECK ("category" IN ('market_basics', 'risk_management', 'technical_analysis', 'trading_psychology')),
  CONSTRAINT "daily_tips_status" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "daily_tips_body_length" CHECK (char_length("body") BETWEEN 10 AND 240),
  CONSTRAINT "daily_tips_course_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL,
  CONSTRAINT "daily_tips_author_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "daily_tips_status_idx" ON "daily_tips"("status", "created_at", "id");

-- Learners Leaderboard: a learner appears only after choosing to (default: not shown).
ALTER TABLE "users" ADD COLUMN "leaderboard_opt_in" BOOLEAN NOT NULL DEFAULT false;
