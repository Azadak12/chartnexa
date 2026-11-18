import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config/config.js";
import { DEV_MFA_KEY, open, parseKey, seal } from "./secret-box.js";

const key = randomBytes(32);
const base = {
  DATABASE_URL: "postgresql://x@localhost/x",
  CURSOR_SECRET: "c".repeat(32),
  ACCESS_TOKEN_SECRET: "a".repeat(32),
};

describe("sealed secrets", () => {
  it("round trips and uses a new nonce every time", () => {
    const a = seal("JBSWY3DPEHPK3PXP", key);
    const b = seal("JBSWY3DPEHPK3PXP", key);
    expect(open(a, key)).toBe("JBSWY3DPEHPK3PXP");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toContain("JBSWY3DP");
  });

  it("refuses a wrong key and any tampering", () => {
    const sealed = seal("JBSWY3DPEHPK3PXP", key);
    expect(() => open(sealed, randomBytes(32))).toThrow();
    const flip = (s: string) =>
      Buffer.from(Buffer.from(s, "base64").map((b, i) => (i === 0 ? b ^ 1 : b))).toString("base64");
    expect(() => open({ ...sealed, ciphertext: flip(sealed.ciphertext) }, key)).toThrow();
    expect(() => open({ ...sealed, tag: flip(sealed.tag) }, key)).toThrow();
    expect(() => open({ ...sealed, iv: flip(sealed.iv) }, key)).toThrow();
  });

  it("accepts only 32-byte base64 keys", () => {
    expect(parseKey(key.toString("base64"))).toEqual(key);
    for (const bad of [
      "",
      "short",
      Buffer.alloc(16).toString("base64"),
      Buffer.alloc(33).toString("base64"),
      "not base64!!",
    ]) {
      expect(parseKey(bad), bad).toBeNull();
    }
  });
});

describe("encryption key in configuration", () => {
  it("is optional outside production, where the development key is used", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "development" })).not.toThrow();
    expect(() =>
      loadConfig({ ...base, NODE_ENV: "test", MFA_ENCRYPTION_KEY: DEV_MFA_KEY }),
    ).not.toThrow();
  });

  it("must be a real 32-byte key when given", () => {
    expect(() => loadConfig({ ...base, MFA_ENCRYPTION_KEY: "tooshort" })).toThrow(
      /MFA_ENCRYPTION_KEY/,
    );
  });

  it("is required in production and may not be the development key", () => {
    const prod = { ...base, NODE_ENV: "production", MAILER_DRIVER: "dev" };
    // The mail sender check also fails in production; only the key's issue is asserted here.
    const msg = (extra: Record<string, string>) => {
      try {
        loadConfig({ ...prod, ...extra });
        return "";
      } catch (e) {
        return String(e);
      }
    };
    expect(msg({})).toMatch(/MFA_ENCRYPTION_KEY: a real encryption key is required/);
    expect(msg({ MFA_ENCRYPTION_KEY: DEV_MFA_KEY })).toMatch(
      /MFA_ENCRYPTION_KEY: a real encryption key is required/,
    );
    expect(msg({ MFA_ENCRYPTION_KEY: key.toString("base64") })).not.toMatch(/MFA_ENCRYPTION_KEY/);
  });

  it("never prints the key in an error", () => {
    const secret = randomBytes(16).toString("base64");
    try {
      loadConfig({ ...base, MFA_ENCRYPTION_KEY: secret });
    } catch (e) {
      expect(String(e)).not.toContain(secret);
    }
  });
});
