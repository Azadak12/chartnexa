import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, securityWarnings } from "./config.js";

const valid = {
  NODE_ENV: "development",
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

  it("refuses to start when NODE_ENV is missing, empty or unknown, and says how to fix it", () => {
    const { NODE_ENV: _omit, ...without } = valid;
    void _omit;
    expect(() => loadConfig(without)).toThrow(/NODE_ENV: is required and has no default/);
    expect(() => loadConfig(without)).toThrow(/env:init/);
    expect(() => loadConfig({ ...valid, NODE_ENV: "" })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ ...valid, NODE_ENV: "prod" })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ ...valid, NODE_ENV: "Development" })).toThrow(/NODE_ENV/);
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

  it("refuses the development providers in production, naming each setting", () => {
    for (const key of ["STORAGE_DRIVER", "SCANNER", "VIDEO_PROVIDER", "PAYMENT_PROVIDER"]) {
      expect(() => loadConfig({ ...valid, NODE_ENV: "production" })).toThrow(new RegExp(key));
    }
    expect(loadConfig({ ...valid, NODE_ENV: "development" }).PAYMENT_PROVIDER).toBe("test");
  });

  describe("the hosted pilot (Render and Neon)", () => {
    const hosted = {
      ...valid,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db?sslmode=require",
      MFA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      MAILER_DRIVER: "resend",
      RESEND_API_KEY: "re_x",
      MAIL_FROM: "ChartNexa <hello@example.com>",
      STORAGE_DRIVER: "postgres",
      VIDEO_PROVIDER: "direct",
      PAYMENT_PROVIDER: "disabled",
      SCANNER: "clamav",
      CLAMAV_HOST: "clamav",
      TRUST_PROXY: "true",
    };
    it("accepts the hosted adapters in production", () => {
      const c = loadConfig(hosted);
      expect([c.STORAGE_DRIVER, c.VIDEO_PROVIDER, c.PAYMENT_PROVIDER, c.SCANNER]).toEqual([
        "postgres",
        "direct",
        "disabled",
        "clamav",
      ]);
      expect(c.MFA_DEV_BYPASS).toBe(false);
    });
    it("allows the explicit password-only staff policy in production, defaulting to MFA", () => {
      expect(loadConfig(hosted).STAFF_MFA_REQUIRED).toBe(true);
      expect(loadConfig({ ...hosted, STAFF_MFA_REQUIRED: "false" }).STAFF_MFA_REQUIRED).toBe(false);
      expect(() => loadConfig({ ...hosted, STAFF_MFA_REQUIRED: "no" })).toThrow(
        /STAFF_MFA_REQUIRED/,
      );
    });
    it("still refuses every development adapter and the shortcut in production", () => {
      for (const [k, v] of [
        ["STORAGE_DRIVER", "local"],
        ["VIDEO_PROVIDER", "test"],
        ["PAYMENT_PROVIDER", "test"],
        ["SCANNER", "none"],
        ["MAILER_DRIVER", "dev"],
        ["MFA_DEV_BYPASS", "true"],
      ] as const) {
        expect(() => loadConfig({ ...hosted, [k]: v }), k).toThrow(new RegExp(k));
      }
    });
    it("allows no scanner only when file uploads are switched off", () => {
      const noScan = { ...hosted, SCANNER: "none", CLAMAV_HOST: undefined };
      expect(() => loadConfig(noScan)).toThrow(/SCANNER/);
      expect(loadConfig({ ...noScan, FILE_UPLOADS: "disabled" }).FILE_UPLOADS).toBe("disabled");
      expect(() => loadConfig({ ...hosted, CLAMAV_HOST: undefined })).toThrow(/CLAMAV_HOST/);
    });
    it("requires TLS to a database that is not on this computer", () => {
      expect(() =>
        loadConfig({ ...hosted, DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" }),
      ).toThrow(/sslmode/);
      expect(
        loadConfig({ ...hosted, DATABASE_URL: "postgresql://u:p@localhost:5432/db" }).NODE_ENV,
      ).toBe("production");
    });
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

  describe("the development two-step shortcut", () => {
    const dev = { ...valid, NODE_ENV: "development", MFA_DEV_BYPASS: "true" };
    it("is off by default and on only when asked for in development", () => {
      expect(loadConfig({ ...valid, NODE_ENV: "development" }).MFA_DEV_BYPASS).toBe(false);
      expect(loadConfig(dev).MFA_DEV_BYPASS).toBe(true);
    });
    it("is refused in production and in test, whatever else is set", () => {
      for (const NODE_ENV of ["production", "test"]) {
        expect(() => loadConfig({ ...dev, NODE_ENV })).toThrow(/two-step shortcut/);
      }
    });
    it("is refused for a database that is not on this computer", () => {
      for (const host of ["db.internal.example.com", "10.0.0.5", "prod-db.rds.amazonaws.com"]) {
        expect(() =>
          loadConfig({ ...dev, DATABASE_URL: `postgresql://u:p@${host}:5432/x` }),
        ).toThrow(/database on this computer/);
      }
      for (const host of ["localhost", "127.0.0.1", "[::1]", "mymac.local"]) {
        expect(
          loadConfig({ ...dev, DATABASE_URL: `postgresql://u:p@${host}:5432/x` }).MFA_DEV_BYPASS,
        ).toBe(true);
      }
    });
    it("does not accept values other than true and false", () => {
      expect(() => loadConfig({ ...dev, MFA_DEV_BYPASS: "1" })).toThrow();
      expect(() => loadConfig({ ...dev, MFA_DEV_BYPASS: "yes" })).toThrow();
    });
  });

  describe("start-up security warnings", () => {
    const base = { ...valid, NODE_ENV: "development" };
    it("warns loudly when the shortcut is on, and says nothing for a clean local setup", () => {
      const on = { ...base, MFA_DEV_BYPASS: "true" };
      expect(securityWarnings(loadConfig(on), on).join(" ")).toMatch(/MFA_DEV_BYPASS is on/);
      const clean = { ...base, DATABASE_URL: "postgresql://u:p@localhost:5432/x" };
      expect(securityWarnings(loadConfig(clean), clean)).toEqual([]);
    });
    it("warns about a development server with a remote database, and never prints a value", () => {
      const env = { ...base, DATABASE_URL: "postgresql://u:secretpw@db.example.com:5432/x" };
      const w = securityWarnings(loadConfig(env), env);
      expect(w.length).toBe(1);
      expect(w.join(" ")).not.toContain("secretpw");
    });
  });
});
