import { SignJWT, decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../config/config.js";
import { AccessTokenService } from "./access-token.service.js";
import { hashToken, newOpaqueToken } from "./token-util.js";

const base = {
  DATABASE_URL: "postgresql://localhost/x",
  CURSOR_SECRET: "c".repeat(32),
  ACCESS_TOKEN_SECRET: "a".repeat(32),
};
const svc = (extra: Record<string, string> = {}) =>
  new AccessTokenService(loadConfig({ ...base, ...extra }));
const claims = {
  userId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
};

describe("AccessTokenService", () => {
  it("round-trips claims", async () => {
    const s = svc();
    expect(await s.verify(await s.sign(claims))).toEqual(claims);
  });

  it("contains no email, role or permission claims", async () => {
    const payload = decodeJwt(await svc().sign(claims));
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "jti", "sid", "sub"]);
  });

  it("rejects expired, wrongly signed, tampered and garbage tokens", async () => {
    const s = svc();
    expect(await s.verify(await s.sign(claims, -10))).toBeNull();
    const other = svc({ ACCESS_TOKEN_SECRET: "b".repeat(32) });
    expect(await s.verify(await other.sign(claims))).toBeNull();
    const good = await s.sign(claims);
    const [h, p, sig] = good.split(".") as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ sub: "x", sid: "y", exp: 9999999999 })).toString(
      "base64url",
    );
    expect(await s.verify(`${h}.${forged}.${sig}`)).toBeNull();
    expect(await s.verify(`${h}.${p}`)).toBeNull();
    expect(await s.verify("garbage")).toBeNull();
  });

  it("rejects tokens using the none algorithm or other algorithms", async () => {
    const s = svc();
    const hs512 = await new SignJWT({ sid: "s" })
      .setProtectedHeader({ alg: "HS512" })
      .setSubject("u")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(base.ACCESS_TOKEN_SECRET));
    expect(await s.verify(hs512)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sub":"u","sid":"s"}').toString("base64url")}.`;
    expect(await s.verify(none)).toBeNull();
  });

  it("accepts tokens signed with the previous secret during rotation", async () => {
    const old = svc({ ACCESS_TOKEN_SECRET: "o".repeat(32) });
    const rotated = svc({ ACCESS_TOKEN_SECRET_PREVIOUS: "o".repeat(32) });
    expect(await rotated.verify(await old.sign(claims))).toEqual(claims);
    expect(await svc().verify(await old.sign(claims))).toBeNull();
  });
});

describe("token-util", () => {
  it("makes unique 256-bit tokens and stable hashes", () => {
    const a = newOpaqueToken();
    expect(a).not.toBe(newOpaqueToken());
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toContain(a);
  });
});
