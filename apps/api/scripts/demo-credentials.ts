import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Prints the development demo logins on this computer. The file is owner-only and never committed. */
const file = join(fileURLToPath(new URL(".", import.meta.url)), "..", ".dev-credentials.json");
try {
  const creds = JSON.parse(await readFile(file, "utf8")) as {
    accounts: Record<string, { role: string; password: string }>;
  };
  console.log("Development demo logins (for your own phone and computer only)\n");
  for (const [email, a] of Object.entries(creds.accounts)) {
    console.log(`${a.role.padEnd(11)} ${email}\n            ${a.password}\n`);
  }
  console.log(
    "Admin and Manager sign in with a second step unless MFA_DEV_BYPASS=true is set in apps/api/.env (local development only): see docs/demo/README.md.",
  );
} catch {
  console.error("No credentials file yet. Run: pnpm --filter @chartnexa/api seed:demo");
  process.exit(1);
}
