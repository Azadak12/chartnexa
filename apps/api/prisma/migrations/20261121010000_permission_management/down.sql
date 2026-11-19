DROP TABLE "user_permission_denials";
DROP TABLE "role_permission_defaults";
ALTER TABLE "instructor_grants" DROP CONSTRAINT "instructor_grants_expiry_after_grant";
ALTER TABLE "instructor_grants" DROP COLUMN "expires_at";
