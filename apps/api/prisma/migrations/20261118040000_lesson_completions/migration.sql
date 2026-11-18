-- A lesson's id is already unique; this pair lets a completion point at "this lesson of this
-- course" so the database can prove the two belong together.
CREATE UNIQUE INDEX "lessons_id_course_id_key" ON "lessons"("id", "course_id");

-- CreateTable
CREATE TABLE "lesson_completions" (
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_completions_pkey" PRIMARY KEY ("user_id","lesson_id")
);

-- CreateIndex
CREATE INDEX "lesson_completions_user_id_course_id_idx" ON "lesson_completions"("user_id", "course_id");

-- AddForeignKey
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: a completion cannot name a lesson from another course, and goes with its lesson.
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_lesson_id_course_id_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE CASCADE ON UPDATE CASCADE;
