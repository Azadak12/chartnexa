import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * A development-only key so local runs and tests need no setup. Production refuses it at start
 * (see `loadConfig`); it protects nothing.
 */
export const DEV_MFA_KEY = Buffer.alloc(32, 7).toString("base64");

export interface Sealed {
  ciphertext: string;
  iv: string;
  tag: string;
}

/** The 32-byte key from base64, or null when it is not a valid key. */
export function parseKey(base64: string): Buffer | null {
  const key = Buffer.from(base64, "base64");
  return key.length === 32 && key.toString("base64") === base64 ? key : null;
}

/** AES-256-GCM with a fresh random nonce each time, so equal secrets look different. */
export function seal(plain: string, key: Buffer): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** Throws when the key is wrong or anything was changed. */
export function open(sealed: Sealed, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
