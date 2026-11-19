-- Permission management: optional expiry on individual grants, role-level default overrides,
-- and individual "switched off" records. All writes are made by Admins only, with a reason.

ALTER TABLE "instructor_grants" ADD COLUMN "expires_at" TIMESTAMPTZ(6);
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_expiry_after_grant" CHECK ("expires_at" IS NULL OR "expires_at" > "created_at");

-- One row per (role, permission) the Admin has changed from the built-in default.
CREATE TABLE "role_permission_defaults" (
  "role" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "set_by" UUID,
  "reason" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "role_permission_defaults_pkey" PRIMARY KEY ("role", "permission"),
  CONSTRAINT "role_permission_defaults_role" CHECK ("role" IN ('student','instructor','manager')),
  CONSTRAINT "role_permission_defaults_permission_not_restricted" CHECK ("permission" NOT IN ('roles:manage','audit:read','payments:read_full','instructor_permissions:manage')),
  CONSTRAINT "role_permission_defaults_reason_length" CHECK (char_length("reason") BETWEEN 3 AND 200),
  CONSTRAINT "role_permission_defaults_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "users"("id") ON DELETE SET NULL
);

-- A permission the person's role gives them, switched off for this one person.
CREATE TABLE "user_permission_denials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "permission" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by" UUID,
  "revoke_reason" TEXT,
  CONSTRAINT "user_permission_denials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_permission_denials_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  CONSTRAINT "user_permission_denials_permission_not_restricted" CHECK ("permission" NOT IN ('roles:manage','audit:read','payments:read_full','instructor_permissions:manage')),
  CONSTRAINT "user_permission_denials_reason_length" CHECK (char_length("reason") BETWEEN 3 AND 200),
  CONSTRAINT "user_permission_denials_expiry_after_create" CHECK ("expires_at" IS NULL OR "expires_at" > "created_at")
);
CREATE UNIQUE INDEX "user_permission_denials_active_uniq" ON "user_permission_denials"("user_id", "permission") WHERE "revoked_at" IS NULL;
CREATE INDEX "user_permission_denials_user_idx" ON "user_permission_denials"("user_id", "revoked_at");
