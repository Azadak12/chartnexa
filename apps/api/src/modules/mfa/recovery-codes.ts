import { randomInt } from "node:crypto";
import { hashToken } from "../identity/index.js";

/** No 0, 1, i, l or o, so a code read off paper cannot be mistyped as another character. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const LENGTH = 12;
export const RECOVERY_CODE_COUNT = 10;

/** One code as `xxxx-xxxx-xxxx`, about 59 bits from the system random generator. */
export function newRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Strips spaces and hyphens and lower-cases, or returns null when it cannot be a recovery code. */
export function normalizeRecoveryCode(input: string): string | null {
  const raw = input.replace(/[\s-]+/g, "").toLowerCase();
  return new RegExp(`^[${ALPHABET}]{${LENGTH}}$`).test(raw) ? raw : null;
}

/** SHA-256 is fine here: the input already carries about 59 bits of randomness and is single use. */
export const hashRecoveryCode = (normalized: string): string => hashToken(`recovery:${normalized}`);
