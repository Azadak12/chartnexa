-- Coursework: assignments per course, who they are assigned to, and what students hand in.
CREATE TABLE "assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "course_id" UUID NOT NULL,
  "lesson_id" UUID,
  "title" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "due_at" TIMESTAMPTZ(6),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "attachment_key" TEXT,
  "attachment_name" TEXT,
  "attachment_mime" TEXT,
  "attachment_size" INTEGER,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignments_course_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE,
  CONSTRAINT "assignments_creator_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "assignments_title_length" CHECK (char_length("title") BETWEEN 3 AND 120),
  CONSTRAINT "assignments_instructions_length" CHECK (char_length("instructions") BETWEEN 1 AND 4000),
  CONSTRAINT "assignments_status_known" CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "assignments_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "assignments_attachment_all_or_none" CHECK (
    ("attachment_key" IS NULL) = ("attachment_name" IS NULL)
    AND ("attachment_key" IS NULL) = ("attachment_mime" IS NULL)
    AND ("attachment_key" IS NULL) = ("attachment_size" IS NULL)
  ),
  CONSTRAINT "assignments_attachment_size" CHECK ("attachment_size" IS NULL OR "attachment_size" BETWEEN 1 AND 4194304)
);
-- A lesson link must name a lesson of the same course; losing the lesson keeps the assignment.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lesson_same_course_fkey"
  FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id")
  ON DELETE SET NULL ("lesson_id") ON UPDATE CASCADE;
CREATE INDEX "assignments_course_idx" ON "assignments" ("course_id", "created_at" DESC);

CREATE TABLE "assignment_recipients" (
  "assignment_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "assigned_by" UUID,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "assignment_recipients_pkey" PRIMARY KEY ("assignment_id", "user_id"),
  CONSTRAINT "assignment_recipients_assignment_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE,
  CONSTRAINT "assignment_recipients_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "assignment_recipients_assigner_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "assignment_recipients_user_idx" ON "assignment_recipients" ("user_id", "assigned_at" DESC);

CREATE TABLE "assignment_submissions" (
  "assignment_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "late" BOOLEAN NOT NULL DEFAULT false,
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "feedback" TEXT,
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("assignment_id", "user_id"),
  CONSTRAINT "assignment_submissions_recipient_fkey" FOREIGN KEY ("assignment_id", "user_id")
    REFERENCES "assignment_recipients"("assignment_id", "user_id") ON DELETE CASCADE,
  CONSTRAINT "assignment_submissions_reviewer_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "assignment_submissions_body_length" CHECK (char_length("body") BETWEEN 1 AND 5000),
  CONSTRAINT "assignment_submissions_status_known" CHECK ("status" IN ('submitted', 'reviewed')),
  CONSTRAINT "assignment_submissions_feedback_length" CHECK ("feedback" IS NULL OR char_length("feedback") BETWEEN 1 AND 2000),
  CONSTRAINT "assignment_submissions_reviewed_pair" CHECK (
    ("status" = 'reviewed') = ("reviewed_at" IS NOT NULL AND "feedback" IS NOT NULL)
  )
);

-- The new grantable permission `assignments:manage` (R41).
ALTER TABLE "instructor_grants" DROP CONSTRAINT "instructor_grants_permission_grantable";
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_permission_grantable" CHECK ("permission" IN ('course:create','course:update','course:publish','lesson:upload','live:schedule','assignments:manage','students:read','reports:read'));
