import "reflect-metadata";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.factory.js";
import { loadConfig } from "../src/config/config.js";
import { DEMO_ACCOUNTS, runDemoSeed } from "./demo/seed.js";

/**
 * `pnpm seed:demo [--reset-passwords] [--reset-mfa] [--allow-remote-db]`
 *
 * Development only. Refuses to run in production, and against a database that is not on this
 * computer unless you say so. Never deletes data; running it again changes nothing that exists.
 */
const args = new Set(process.argv.slice(2).filter((a) => a !== "--"));
const here = fileURLToPath(new URL(".", import.meta.url));

if (process.env["NODE_ENV"] === "production") {
  console.error("Refusing to run: the demo seed is for development only.");
  process.exit(1);
}
let config;
try {
  config = loadConfig(process.env);
} catch (e) {
  console.error(e instanceof Error ? e.message : "Configuration problem");
  console.error(
    "Hint: copy .env.example to apps/api/.env and fill CURSOR_SECRET and ACCESS_TOKEN_SECRET.",
  );
  process.exit(1);
}
if (config.NODE_ENV === "production") {
  console.error("Refusing to run: the demo seed is for development only.");
  process.exit(1);
}
const host = new URL(config.DATABASE_URL).hostname;
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || host.endsWith(".local");
if (!local && !args.has("--allow-remote-db")) {
  console.error(
    `Refusing to seed a database on "${host}". Use --allow-remote-db only for a throwaway development database.`,
  );
  process.exit(1);
}

const app = await createApp(config);
await app.init();
try {
  const credentialsFile = join(here, "..", ".dev-credentials.json");
  const report = await runDemoSeed(app, {
    assetsDir: join(here, "..", "demo-assets"),
    credentialsFile,
    resetPasswords: args.has("--reset-passwords"),
    resetMfa: args.has("--reset-mfa"),
    log: (l) => console.log(`  ${l}`),
  });
  console.log(
    `\nDemo data ready: ${report.courses} courses, ${report.lessons} lessons, ${report.videos} videos, ${report.resources} PDFs, ${report.assignments} assignments.`,
  );
  console.log(`Demo accounts: ${DEMO_ACCOUNTS.map((a) => a.email).join(", ")}`);
  console.log(`Passwords are in ${credentialsFile} (owner-only file, never committed).`);
  console.log("Show them on this computer with: pnpm --filter @chartnexa/api demo:credentials");
  if (report.passwordsUnknown.length > 0) {
    console.log(
      `\nNo saved password for: ${report.passwordsUnknown.join(", ")}. Run again with --reset-passwords to set new ones.`,
    );
  }
} finally {
  await app.close();
}
