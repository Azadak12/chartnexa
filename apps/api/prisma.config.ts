import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Neon: DATABASE_URL is the pooled address the API uses; migrations need the direct one.
  datasource: { url: process.env["MIGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "" },
});
