import { timingSafeEqual } from "node:crypto";
import * as OTPAuth from "otpauth";

/** SHA-1, 6 digits, 30 seconds: what every authenticator app expects (RFC 6238). */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
const ISSUER = "ChartNexa";

/** A fresh 160-bit secret as base32, the form authenticator apps take. */
export function newSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

const totpFor = (secretBase32: string) =>
  new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

/** The time step a moment falls in. */
export const stepAt = (timeMs: number): number => Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS);

/** The code for a given step (used by tests and the enrollment check). */
export function codeForStep(secretBase32: string, step: number): string {
  return totpFor(secretBase32).generate({ timestamp: step * TOTP_PERIOD_SECONDS * 1000 });
}

/** `otpauth://` link that authenticator apps open to add the account. */
export function otpauthUri(secretBase32: string, accountName: string): string {
  const t = totpFor(secretBase32);
  t.label = accountName;
  return t.toString();
}

const equal = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Returns the time step the code belongs to when it is right for the step before, at or after
 * `nowMs` (clock drift), otherwise null. Every candidate is compared, in constant time, so the
 * answer does not reveal which step was close.
 */
export function matchStep(secretBase32: string, code: string, nowMs: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(nowMs);
  let found: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    if (equal(codeForStep(secretBase32, step), code) && found === null) found = step;
  }
  return found;
}
