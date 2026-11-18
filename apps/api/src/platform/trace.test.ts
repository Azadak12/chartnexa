import { describe, expect, it } from "vitest";
import { resolveTraceId } from "./trace.js";

describe("trace ids", () => {
  it("takes the trace id of a valid traceparent", () => {
    const id = "4bf92f3577b34da6a3ce929d0e0e4736";
    expect(resolveTraceId(`00-${id}-00f067aa0ba902b7-01`)).toBe(id);
    expect(resolveTraceId([`00-${id.toUpperCase()}-00f067aa0ba902b7-01`])).toBe(id);
  });

  it("makes a new one for missing, malformed or all-zero headers", () => {
    for (const h of [
      undefined,
      "",
      "garbage",
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7",
      `00-${"0".repeat(32)}-00f067aa0ba902b7-01`,
      `00-4bf92f3577b34da6a3ce929d0e0e4736-${"0".repeat(16)}-01`,
      "00-zzf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    ]) {
      const id = resolveTraceId(h);
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(id).not.toBe("0".repeat(32));
    }
    expect(resolveTraceId(undefined)).not.toBe(resolveTraceId(undefined));
  });
});
