-- Invitation-only Instructor access (admins and managers invite; the person accepts by email link).
CREATE TABLE "instructor_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "invited_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "accepted_by" UUID,
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by" UUID,
  CONSTRAINT "instructor_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instructor_invitations_inviter_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "instructor_invitations_acceptor_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "instructor_invitations_revoker_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "instructor_invitations_status_known" CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT "instructor_invitations_email_lower" CHECK ("email" = lower("email") AND char_length("email") BETWEEN 3 AND 254),
  CONSTRAINT "instructor_invitations_expiry" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "instructor_invitations_accepted_pair" CHECK (("status" = 'accepted') = ("accepted_at" IS NOT NULL)),
  CONSTRAINT "instructor_invitations_revoked_pair" CHECK (("status" = 'revoked') = ("revoked_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "instructor_invitations_token_key" ON "instructor_invitations" ("token_hash");
-- At most one open invitation per address; this is what makes duplicate invites safe under races.
CREATE UNIQUE INDEX "instructor_invitations_open_email" ON "instructor_invitations" ("email") WHERE "status" = 'pending';
CREATE INDEX "instructor_invitations_feed_idx" ON "instructor_invitations" ("created_at" DESC, "id" DESC);
