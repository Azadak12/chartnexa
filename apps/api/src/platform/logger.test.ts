import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

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
