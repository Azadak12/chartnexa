-- Hosted object storage inside PostgreSQL (STORAGE_DRIVER=postgres): private by construction (no
-- public URL; every read goes through the API's signed links). For pilot-scale files and video.
CREATE TABLE "storage_objects" (
  "key" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "modified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "storage_objects_key_shape" CHECK ("key" ~ '^[a-z0-9][a-z0-9/_-]{0,200}$'),
  CONSTRAINT "storage_objects_size" CHECK ("size_bytes" = octet_length("data"))
);
ALTER TABLE "storage_objects" ALTER COLUMN "data" SET STORAGE EXTERNAL;
