-- CreateTable
CREATE TABLE "mfa_credentials" (
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "secret_iv" TEXT NOT NULL,
    "secret_tag" TEXT NOT NULL,
    "enabled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_step" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "mfa_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "pending_ciphertext" TEXT,
    "pending_iv" TEXT,
    "pending_tag" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_user_id_code_hash_key" ON "mfa_recovery_codes"("user_id", "code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_challenges_token_hash_key" ON "mfa_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "mfa_challenges_expires_at_idx" ON "mfa_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "mfa_credentials" ADD CONSTRAINT "mfa_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Second line of defense: the database refuses what the API would also refuse.
ALTER TABLE "mfa_credentials" ADD CONSTRAINT "mfa_credentials_step_not_negative" CHECK ("last_used_step" >= 0);
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_kind_known" CHECK ("kind" IN ('verify','setup'));
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_attempts_range" CHECK ("attempts" BETWEEN 0 AND 10);
-- A pending secret exists only on a setup challenge, and all three parts come together.
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_pending_complete" CHECK (
  ("pending_ciphertext" IS NULL) = ("pending_iv" IS NULL) AND ("pending_iv" IS NULL) = ("pending_tag" IS NULL)
);
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_pending_only_setup" CHECK ("pending_ciphertext" IS NULL OR "kind" = 'setup');

-- One unused challenge per person and kind: a new sign-in replaces the old one.
CREATE UNIQUE INDEX "mfa_challenges_one_unused" ON "mfa_challenges"("user_id", "kind") WHERE "used_at" IS NULL;

-- Rollout: current Admins and Managers sign in again, through the second step.
UPDATE "sessions" SET "revoked_at" = CURRENT_TIMESTAMP, "revoked_reason" = 'mfa_rollout'
WHERE "revoked_at" IS NULL AND "user_id" IN (
  SELECT "user_id" FROM "user_roles" WHERE "revoked_at" IS NULL AND "role" IN ('admin','manager')
);
