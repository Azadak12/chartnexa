import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const valid = {
  DATABASE_URL: "postgresql://localhost:5432/db",
  CURSOR_SECRET: "x".repeat(32),
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
});
