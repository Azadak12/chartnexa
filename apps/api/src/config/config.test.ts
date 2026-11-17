import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const valid = {
  DATABASE_URL: "postgresql://localhost:5432/db",
  CURSOR_SECRET: "x".repeat(32),
  ACCESS_TOKEN_SECRET: "y".repeat(32),
};

describe("loadConfig", () => {
  it("accepts valid config and applies defaults", () => {
    const c = loadConfig(valid);
    expect(c.PORT).toBe(3000);
    expect(c.NODE_ENV).toBe("development");
  });

  it("names a missing variable without leaking any secret value", () => {
    const secret = "s".repeat(40);
    try {
      loadConfig({ CURSOR_SECRET: secret });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as Error).message;
      expect(msg).toContain("DATABASE_URL");
      expect(msg).not.toContain(secret);
    }
  });

  it("rejects an invalid value and does not echo it", () => {
    const bad = "mysql://user:hunter2@host/db";
    try {
      loadConfig({ ...valid, DATABASE_URL: bad });
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("DATABASE_URL");
      expect(msg).not.toContain("hunter2");
    }
  });

  it("rejects a short cursor secret", () => {
    expect(() => loadConfig({ ...valid, CURSOR_SECRET: "short" })).toThrow(/CURSOR_SECRET/);
  });

  it("requires a long access token secret and never echoes it", () => {
    const short = "short-secret-value";
    try {
      loadConfig({ ...valid, ACCESS_TOKEN_SECRET: short });
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("ACCESS_TOKEN_SECRET");
      expect(msg).not.toContain(short);
    }
    expect(() => loadConfig({ ...valid, ACCESS_TOKEN_SECRET: undefined })).toThrow(
      /ACCESS_TOKEN_SECRET: is required/,
    );
  });

  it("rejects dev and memory mail senders in production, naming the setting", () => {
    for (const driver of ["dev", "memory"]) {
      expect(() => loadConfig({ ...valid, NODE_ENV: "production", MAILER_DRIVER: driver })).toThrow(
        /MAILER_DRIVER/,
      );
    }
    expect(
      loadConfig({ ...valid, NODE_ENV: "development", MAILER_DRIVER: "dev" }).MAILER_DRIVER,
    ).toBe("dev");
  });

  it("parses TRUST_PROXY as a boolean defaulting to false", () => {
    expect(loadConfig(valid).TRUST_PROXY).toBe(false);
    expect(loadConfig({ ...valid, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
  });
});
