-- CreateTable
CREATE TABLE "instructor_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "course_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "granted_by" UUID,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoke_reason" TEXT,

    CONSTRAINT "instructor_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_grants_user_id_revoked_at_idx" ON "instructor_grants"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "instructor_grants_course_id_idx" ON "instructor_grants"("course_id");

-- AddForeignKey
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Second line of defense: the database refuses what the API would also refuse.
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_permission_grantable" CHECK ("permission" IN ('course:create','course:update','course:publish','lesson:upload','live:schedule','students:read','reports:read'));
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_scope" CHECK (("permission" = 'course:create') = ("course_id" IS NULL));
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_source" CHECK ("source" IN ('manual','owner_auto'));
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_reason_length" CHECK (char_length("reason") BETWEEN 3 AND 200);

-- At most one active grant per person, permission and course (null course counts as one value).
CREATE UNIQUE INDEX "instructor_grants_one_active" ON "instructor_grants"("user_id", "permission", COALESCE("course_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "revoked_at" IS NULL;
