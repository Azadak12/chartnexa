import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { createApp } from "../src/app.factory.js";
import { loadConfig } from "../src/config/config.js";
import { buildOpenApiDocument } from "../src/platform/openapi.js";

const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://localhost:5432/openapi_export",
  CURSOR_SECRET: "export-only-secret-export-only-secret",
  ACCESS_TOKEN_SECRET: "export-only-access-secret-export-only",
  MAILER_DRIVER: "memory",
});
const app = await createApp(config);
writeFileSync(
  process.argv[2] ?? "openapi.json",
  JSON.stringify(buildOpenApiDocument(app), null, 2) + "\n",
);
await app.close();
