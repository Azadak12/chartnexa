import { argon2, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { ARGON2_PARAMS } from "../src/modules/identity/password/password.service.js";

const hash = promisify(argon2);
const runs = 10;
const start = performance.now();
for (let i = 0; i < runs; i++) {
  await hash("argon2id", {
    message: "benchmark-password",
    nonce: randomBytes(16),
    parallelism: ARGON2_PARAMS.p,
    tagLength: 32,
    memory: ARGON2_PARAMS.m,
    passes: ARGON2_PARAMS.t,
  });
}
const avg = (performance.now() - start) / runs;
console.log(
  `argon2id m=${ARGON2_PARAMS.m} t=${ARGON2_PARAMS.t} p=${ARGON2_PARAMS.p}: ${avg.toFixed(1)} ms avg over ${runs}`,
);
if (avg < 50 || avg > 150) {
  console.error("Average outside the 50-150 ms target; retune ARGON2_PARAMS for this host.");
  process.exit(1);
}
