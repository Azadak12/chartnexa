import { describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import { codeForStep, matchStep, newSecret, otpauthUri, stepAt } from "./totp.js";

// RFC 6238 Appendix B, SHA-1, secret "12345678901234567890" (the RFC lists 8 digits; we use the
// last 6, which is what a 6-digit authenticator shows).
const RFC_SECRET = new OTPAuth.Secret({
  buffer: new TextEncoder().encode("12345678901234567890").buffer as ArrayBuffer,
}).base32;
const VECTORS: [number, string][] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    for (const [seconds, code] of VECTORS) {
      expect(codeForStep(RFC_SECRET, stepAt(seconds * 1000)), `T=${seconds}`).toBe(code);
    }
  });

  it("accepts the previous, current and next step and nothing further away", () => {
    const now = 1111111111 * 1000;
    const s = stepAt(now);
    for (const step of [s - 1, s, s + 1]) {
      expect(matchStep(RFC_SECRET, codeForStep(RFC_SECRET, step), now)).toBe(step);
    }
    for (const step of [s - 2, s + 2, s - 10]) {
      expect(matchStep(RFC_SECRET, codeForStep(RFC_SECRET, step), now)).toBeNull();
    }
  });

  it("refuses codes of the wrong shape without comparing them", () => {
    const now = Date.now();
    const good = codeForStep(RFC_SECRET, stepAt(now));
    for (const bad of ["", "12345", "1234567", "12345a", " " + good, good + " ", "٠٠٠٠٠٠"]) {
      expect(matchStep(RFC_SECRET, bad, now), JSON.stringify(bad)).toBeNull();
    }
  });

  it("refuses a code made from a different secret", () => {
    const now = Date.now();
    expect(matchStep(RFC_SECRET, codeForStep(newSecret(), stepAt(now)), now)).toBeNull();
  });

  it("makes long random secrets that authenticator apps accept", () => {
    const a = newSecret();
    const b = newSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("builds the otpauth link authenticator apps open", () => {
    const uri = otpauthUri(RFC_SECRET, "ann@example.com");
    expect(uri.startsWith("otpauth://totp/ChartNexa:ann%40example.com?")).toBe(true);
    const q = new URL(uri).searchParams;
    expect(q.get("secret")).toBe(RFC_SECRET);
    expect(q.get("issuer")).toBe("ChartNexa");
    expect(q.get("algorithm")).toBe("SHA1");
    expect(q.get("digits")).toBe("6");
    expect(q.get("period")).toBe("30");
  });
});
