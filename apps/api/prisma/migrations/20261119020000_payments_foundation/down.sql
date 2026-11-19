DROP TABLE "payment_events";
DROP TABLE "orders";
DELETE FROM "entitlements" WHERE "source" <> 'admin_grant';
ALTER TABLE "entitlements" DROP CONSTRAINT "entitlements_source_known";
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_source_known" CHECK ("source" IN ('admin_grant'));
