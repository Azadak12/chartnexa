import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Local development setup: creates apps/api/.env from the root .env.example, with fresh random
 * secrets, and an explicit NODE_ENV=development. It never overwrites an existing .env.
 * Usage: pnpm --filter @chartnexa/api env:init
 */
const target = fileURLToPath(new URL("../.env", import.meta.url));
const example = fileURLToPath(new URL("../../../.env.example", import.meta.url));

if (existsSync(target)) {
  console.log("apps/api/.env already exists; leaving it as it is.");
  process.exit(0);
}
const hex = (): string => randomBytes(32).toString("hex");
const text = readFileSync(example, "utf8")
  .replace(/^CURSOR_SECRET=.*$/m, `CURSOR_SECRET=${hex()}`)
  .replace(/^ACCESS_TOKEN_SECRET=.*$/m, `ACCESS_TOKEN_SECRET=${hex()}`);
writeFileSync(target, text, { mode: 0o600 });
console.log(
  "Created apps/api/.env with NODE_ENV=development and new local secrets. Check DATABASE_URL, then run: pnpm --filter @chartnexa/api dev",
);
