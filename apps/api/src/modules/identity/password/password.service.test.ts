import { describe, expect, it } from "vitest";
import { ARGON2_PARAMS, checkPasswordPolicy, PasswordService } from "./password.service.js";

const svc = new PasswordService();

describe("checkPasswordPolicy", () => {
  it("accepts a compliant password", () => {
    expect(checkPasswordPolicy("correct horse battery", "a@b.co")).toEqual({ ok: true });
  });
  it("rejects too short, too long, equal to email and common passwords", () => {
    expect(checkPasswordPolicy("short").ok).toBe(false);
    expect(checkPasswordPolicy("x".repeat(129)).ok).toBe(false);
    expect(checkPasswordPolicy("Person@Example.com", "person@example.com").ok).toBe(false);
    expect(checkPasswordPolicy("Password123").ok).toBe(false);
    expect(checkPasswordPolicy("qwertyuiop").ok).toBe(false);
  });
  it("applies no composition rules", () => {
    expect(checkPasswordPolicy("alllowercaseletters").ok).toBe(true);
  });
});

describe("PasswordService", () => {
  it("hashes with Argon2id, verifies the right password and rejects the wrong one", async () => {
    const h = await svc.hash("correct horse battery");
    expect(h.startsWith(`$argon2id$v=19$m=${ARGON2_PARAMS.m},t=${ARGON2_PARAMS.t},p=1$`)).toBe(
      true,
    );
    expect(h).not.toContain("correct horse");
    expect(await svc.verify("correct horse battery", h)).toBe(true);
    expect(await svc.verify("wrong horse battery", h)).toBe(false);
  });

  it("uses a fresh salt every time", async () => {
    expect(await svc.hash("same password value")).not.toBe(await svc.hash("same password value"));
  });

  it("flags weaker stored parameters for upgrade and malformed hashes", async () => {
    const h = await svc.hash("correct horse battery");
    expect(svc.needsRehash(h)).toBe(false);
    expect(svc.needsRehash(h.replace(`m=${ARGON2_PARAMS.m}`, "m=19456"))).toBe(true);
    expect(svc.needsRehash("not-a-hash")).toBe(true);
    expect(await svc.verify("x", "not-a-hash")).toBe(false);
  });
});
