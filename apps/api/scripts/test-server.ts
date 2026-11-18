import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.factory.js";
import { loadConfig } from "../src/config/config.js";
import { createScratchDb, migrateDeploy } from "./lib/scratch-db.js";

/**
 * Starts the real API on a throwaway database so the mobile app's contract tests can talk to
 * it over HTTP. Emails are written by the development mailer into a temporary directory, which
 * is printed so a test can read the verification and reset codes. Never used in production.
 */
const db = await createScratchDb();
migrateDeploy(db.url);
const mailRoot = mkdtempSync(join(tmpdir(), "chartnexa-contract-"));
process.chdir(mailRoot); // the development mailer writes to ./.dev-mail

const config = loadConfig({
  NODE_ENV: "test",
  PORT: "3000",
  LOG_LEVEL: "silent",
  DATABASE_URL: db.url,
  CURSOR_SECRET: "contract-cursor-secret-contract-cursor",
  ACCESS_TOKEN_SECRET: "contract-access-secret-contract-access",
  MAILER_DRIVER: "dev",
  // Generous address limits so many tests can share one address; per-account limits stay default.
  RL_REGISTER_IP_MAX: "100000",
  RL_LOGIN_IP_MAX: "100000",
  RL_GENERIC_IP_MAX: "100000",
});
const app = await createApp(config);
await app.listen({ port: 0, host: "127.0.0.1" });
const address = app.getHttpServer().address() as { port: number };
console.log(`READY ${address.port} ${join(mailRoot, ".dev-mail")} ${db.url}`);

const stop = async (): Promise<void> => {
  await app.close();
  await db.drop();
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
