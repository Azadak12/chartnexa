-- Live classes per course (provider-neutral; the first adapter stores a meeting link, R38).
CREATE TABLE "live_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "course_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "join_url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "cancel_reason" TEXT,
  "cancelled_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_sessions_course_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE,
  CONSTRAINT "live_sessions_creator_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "live_sessions_title_length" CHECK (char_length("title") BETWEEN 3 AND 120),
  CONSTRAINT "live_sessions_description_length" CHECK (char_length("description") <= 2000),
  CONSTRAINT "live_sessions_duration" CHECK ("duration_minutes" BETWEEN 15 AND 480),
  CONSTRAINT "live_sessions_provider_known" CHECK ("provider" IN ('manual')),
  CONSTRAINT "live_sessions_join_url_https" CHECK ("join_url" LIKE 'https://%' AND char_length("join_url") <= 2000),
  CONSTRAINT "live_sessions_status_known" CHECK ("status" IN ('scheduled', 'cancelled')),
  CONSTRAINT "live_sessions_cancel_details" CHECK (
    ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL)
  ),
  CONSTRAINT "live_sessions_cancel_reason_length" CHECK (
    "cancel_reason" IS NULL OR char_length("cancel_reason") BETWEEN 3 AND 300
  ),
  CONSTRAINT "live_sessions_version_positive" CHECK ("version" >= 1)
);
CREATE INDEX "live_sessions_course_starts_idx" ON "live_sessions" ("course_id", "starts_at");
CREATE INDEX "live_sessions_starts_idx" ON "live_sessions" ("starts_at") WHERE "status" = 'scheduled';

-- The first time each person asked for the join link. A fact for staff, not an attendance rule (Q03).
CREATE TABLE "live_attendance" (
  "session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "first_joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "live_attendance_pkey" PRIMARY KEY ("session_id", "user_id"),
  CONSTRAINT "live_attendance_session_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE,
  CONSTRAINT "live_attendance_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "live_attendance_user_idx" ON "live_attendance" ("user_id");
