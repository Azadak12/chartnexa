DELETE FROM "instructor_grants" WHERE "permission" = 'assignments:manage';
ALTER TABLE "instructor_grants" DROP CONSTRAINT "instructor_grants_permission_grantable";
ALTER TABLE "instructor_grants" ADD CONSTRAINT "instructor_grants_permission_grantable" CHECK ("permission" IN ('course:create','course:update','course:publish','lesson:upload','live:schedule','students:read','reports:read'));
DROP TABLE "assignment_submissions";
DROP TABLE "assignment_recipients";
DROP TABLE "assignments";
