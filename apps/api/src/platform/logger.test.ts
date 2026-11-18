import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, safeUrl } from "./logger.js";

describe("logger redaction", () => {
  it("never writes credentials or personal data", () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const log = createLogger("info", sink);
    log.info(
      {
        req: { headers: { authorization: "Bearer SECRET-TOKEN-1", cookie: "sid=COOKIE-2" } },
        user: { password: "PASS-3", email: "a@b.com", token: "TOK-4" },
      },
      "request",
    );
    const out = chunks.join("");
    for (const leak of ["SECRET-TOKEN-1", "COOKIE-2", "PASS-3", "a@b.com", "TOK-4"]) {
      expect(out).not.toContain(leak);
    }
    expect(out).toContain("[REDACTED]");
  });
});

describe("request URLs in logs", () => {
  it("keep the path and parameter names, never the values", () => {
    expect(safeUrl("/staff/users/lookup?email=a%40b.com")).toBe("/staff/users/lookup?email=");
    expect(safeUrl("/courses?q=breakout&level=beginner&cursor=abc")).toBe(
      "/courses?q=&level=&cursor=",
    );
    expect(safeUrl("/courses/123")).toBe("/courses/123");
    expect(safeUrl("/x?=v&%40evil=1&ok=2")).toBe("/x?ok=");
    expect(safeUrl(undefined)).toBeUndefined();
  });

  it("drop secret two-step and password fields from logged objects", () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    createLogger("info", sink).info(
      {
        body: {
          newPassword: "NP-1",
          currentPassword: "CP-2",
          recoveryCode: "RC-3",
          mfaCode: "MC-4",
        },
      },
      "x",
    );
    const out = chunks.join("");
    for (const leak of ["NP-1", "CP-2", "RC-3", "MC-4"]) expect(out).not.toContain(leak);
  });
});
