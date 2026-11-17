import { runBootstrap } from "../src/cli/admin-bootstrap.js";

// `pnpm admin:bootstrap -- --email you@example.com [--recovery]`
const args = process.argv.slice(2).filter((a) => a !== "--");
const result = await runBootstrap(args, process.env);
(result.exitCode === 0 ? console.log : console.error)(result.message);
process.exit(result.exitCode);
