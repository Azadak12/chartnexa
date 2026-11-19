import { runAccountUpdate } from "../src/cli/account-update.js";

/**
 * `pnpm account:update -- --email old@x --new-email new@x`
 * `NEW_PW='...' pnpm account:update -- --email a@x --password-env NEW_PW`
 * `pnpm account:update -- --email a@x --generate-password`   (prints the new password once)
 * Changes how someone signs in, not who they are: role, permissions and data stay.
 */
const args = process.argv.slice(2).filter((a) => a !== "--");
const result = await runAccountUpdate(args, process.env);
(result.exitCode === 0 ? console.log : console.error)(result.message);
if (result.generated) console.log(`New password (shown once): ${result.generated}`);
process.exit(result.exitCode);
