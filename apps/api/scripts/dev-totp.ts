import { createHmac } from "node:crypto";

/**
 * Development helper: prints the current 6-digit code for a two-step setup key, for when you do
 * not want to use an authenticator app. `pnpm --filter @chartnexa/api dev:totp -- <SETUP KEY>`.
 * The setup key is shown once on the app's two-step setup screen. Not for production accounts.
 */
const raw = process.argv
  .slice(2)
  .filter((a) => a !== "--")
  .join("")
  .replace(/[\s-]/g, "")
  .toUpperCase();
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
if (!raw || [...raw].some((c) => !B32.includes(c))) {
  console.error("Give the setup key shown by the app (letters A-Z and digits 2-7).");
  process.exit(1);
}
let bits = 0;
let value = 0;
const bytes: number[] = [];
for (const ch of raw) {
  value = (value << 5) | B32.indexOf(ch);
  bits += 5;
  if (bits >= 8) {
    bytes.push((value >>> (bits - 8)) & 255);
    bits -= 8;
  }
}
const step = Math.floor(Date.now() / 30_000);
const counter = Buffer.alloc(8);
counter.writeBigUInt64BE(BigInt(step));
const mac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
const offset = (mac[mac.length - 1] as number) & 15;
const code =
  ((((mac[offset] as number) & 127) << 24) |
    (((mac[offset + 1] as number) & 255) << 16) |
    (((mac[offset + 2] as number) & 255) << 8) |
    ((mac[offset + 3] as number) & 255)) %
  1_000_000;
const left = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`${String(code).padStart(6, "0")}  (valid for about ${left} more seconds)`);
