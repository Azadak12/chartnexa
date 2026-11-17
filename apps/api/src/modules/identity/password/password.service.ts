import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { promisify } from "node:util";
import { PASSWORD_MAX, PASSWORD_MIN } from "@chartnexa/api-contracts";
import { COMMON_PASSWORDS } from "./common-passwords.js";

const argon2Async = promisify(argon2);

/** Argon2id parameters: m is KiB. About 65 ms on a developer laptop; see README for tuning. */
export const ARGON2_PARAMS = { m: 65536, t: 2, p: 1 } as const;
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

export type PasswordPolicyResult = { ok: true } | { ok: false; message: string };

export function checkPasswordPolicy(password: string, email?: string | null): PasswordPolicyResult {
  if (password.length < PASSWORD_MIN) {
    return { ok: false, message: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  if (password.length > PASSWORD_MAX) {
    return { ok: false, message: `Password must be at most ${PASSWORD_MAX} characters.` };
  }
  const lowered = password.toLowerCase();
  if (email && lowered === email.toLowerCase()) {
    return { ok: false, message: "Password must not be the same as your email." };
  }
  if (COMMON_PASSWORDS.has(lowered)) {
    return { ok: false, message: "This password is too common." };
  }
  return { ok: true };
}

interface Parsed {
  m: number;
  t: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(encoded: string): Parsed | null {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(
    encoded,
  );
  if (!m) return null;
  return {
    m: Number(m[1]),
    t: Number(m[2]),
    p: Number(m[3]),
    salt: Buffer.from(m[4] as string, "base64"),
    hash: Buffer.from(m[5] as string, "base64"),
  };
}

function derive(password: string, salt: Buffer, m: number, t: number, p: number): Promise<Buffer> {
  return argon2Async("argon2id", {
    message: password,
    nonce: salt,
    parallelism: p,
    tagLength: TAG_LENGTH,
    memory: m,
    passes: t,
  });
}

@Injectable()
export class PasswordService {
  private dummy: Promise<string> | undefined;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const out = await derive(password, salt, ARGON2_PARAMS.m, ARGON2_PARAMS.t, ARGON2_PARAMS.p);
    const b64 = (b: Buffer): string => b.toString("base64").replace(/=+$/, "");
    return `$argon2id$v=19$m=${ARGON2_PARAMS.m},t=${ARGON2_PARAMS.t},p=${ARGON2_PARAMS.p}$${b64(salt)}$${b64(out)}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parsed = parse(encoded);
    if (!parsed) return false;
    const out = await derive(password, parsed.salt, parsed.m, parsed.t, parsed.p);
    return out.length === parsed.hash.length && timingSafeEqual(out, parsed.hash);
  }

  /** True when the stored hash uses weaker parameters than the current ones. */
  needsRehash(encoded: string): boolean {
    const parsed = parse(encoded);
    if (!parsed) return true;
    return parsed.m < ARGON2_PARAMS.m || parsed.t < ARGON2_PARAMS.t || parsed.p !== ARGON2_PARAMS.p;
  }

  /** Burns the same work as a real verification so unknown accounts are not distinguishable by timing. */
  async verifyDummy(password: string): Promise<void> {
    this.dummy ??= this.hash(randomBytes(16).toString("hex"));
    await this.verify(password, await this.dummy);
  }
}
