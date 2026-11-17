import { describe, expect, it } from "vitest";
import { resolveRequestId } from "./request-id.js";

describe("resolveRequestId", () => {
  it("keeps a valid supplied id", () => {
    expect(resolveRequestId("abc-12345678")).toBe("abc-12345678");
  });
  it("replaces missing, oversized and unsafe ids", () => {
    for (const bad of [undefined, "x".repeat(65), "short", "bad id\r\nX: y", "a b c d e f g h"]) {
      const id = resolveRequestId(bad);
      expect(id).not.toBe(bad);
      expect(id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    }
  });
});
