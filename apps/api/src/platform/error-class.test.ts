import { describe, expect, it } from "vitest";
import { classifyError, safeError } from "./error-class.js";

const withCode = (code: string, name = "Error") => Object.assign(new Error("x"), { code, name });

describe("error classification", () => {
  it("calls database and network failures 'dependency'", () => {
    for (const code of ["P1001", "P1002", "P1008", "P1017", "P2024", "ECONNREFUSED", "ETIMEDOUT"]) {
      expect(classifyError(withCode(code))).toBe("dependency");
    }
    const init = new Error("no db");
    init.name = "PrismaClientInitializationError";
    expect(classifyError(init)).toBe("dependency");
    expect(classifyError(new Error("wrapped", { cause: withCode("ECONNRESET") }))).toBe(
      "dependency",
    );
  });

  it("calls everything else 'server'", () => {
    for (const e of [new Error("bug"), withCode("P2002"), "text", null, undefined, 42, {}]) {
      expect(classifyError(e)).toBe("server");
    }
  });
});

describe("safe error logging", () => {
  it("keeps type, code and stack frames but never the message", () => {
    const e = withCode("P1001", "PrismaClientKnownRequestError");
    e.message = "Invalid where: { email: 'person@example.com' }";
    e.stack = `PrismaClientKnownRequestError: ${e.message}\n    at a (file.ts:1:1)\n    at b (file.ts:2:2)`;
    const out = safeError(e);
    expect(out).toEqual({
      type: "PrismaClientKnownRequestError",
      code: "P1001",
      errorClass: "dependency",
      stack: "    at a (file.ts:1:1)\n    at b (file.ts:2:2)",
    });
    expect(JSON.stringify(out)).not.toContain("person@example.com");
  });

  it("refuses names and codes that could smuggle text", () => {
    const e = Object.assign(new Error("m"), { name: "has spaces and @mail.com", code: "a b@c" });
    const out = safeError(e);
    expect(out.type).toBe("Error");
    expect(out.code).toBeUndefined();
    expect(safeError("a string with secret").type).toBe("Error");
  });
});
