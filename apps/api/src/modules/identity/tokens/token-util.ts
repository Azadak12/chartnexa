import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, base64url. Returned to the client once; only its hash is stored. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 is appropriate here because the input already has 256 bits of entropy. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashEmailForKey(normalizedEmail: string): string {
  return createHash("sha256").update(`email:${normalizedEmail}`).digest("hex");
}
