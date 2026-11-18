-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "grant_reason" TEXT NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoke_reason" TEXT,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Second line of defense: the database refuses what the API would also refuse.
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_source_known" CHECK ("source" IN ('admin_grant'));
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_status_known" CHECK ("status" IN ('active','revoked'));
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_grant_reason_length" CHECK (char_length("grant_reason") BETWEEN 3 AND 200);
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_revoke_reason_length" CHECK ("revoke_reason" IS NULL OR char_length("revoke_reason") BETWEEN 3 AND 200);
-- A revoked row says when and why; an active row never does.
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_revoked_complete" CHECK (("status" = 'revoked') = ("revoked_at" IS NOT NULL AND "revoke_reason" IS NOT NULL));

-- At most one active entitlement per person and course (ADR-0006). Revoked rows are history.
CREATE UNIQUE INDEX "entitlements_one_active" ON "entitlements"("user_id", "course_id") WHERE "status" = 'active';

-- Keyset paging for My Courses and for the staff list of a course.
CREATE INDEX "entitlements_mine_idx" ON "entitlements"("user_id", "created_at" DESC, "id" DESC) WHERE "status" = 'active';
CREATE INDEX "entitlements_course_idx" ON "entitlements"("course_id", "created_at" DESC, "id" DESC) WHERE "status" = 'active';
