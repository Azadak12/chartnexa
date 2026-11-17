import { describe, expect, it } from "vitest";
import { errorEnvelopeSchema, isRole } from "./index.js";

describe("isRole", () => {
  it("accepts known roles and rejects others", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("root")).toBe(false);
  });
});

describe("errorEnvelopeSchema", () => {
  it("accepts a minimal envelope and rejects a missing request id", () => {
    expect(errorEnvelopeSchema.safeParse({ code: "X", message: "m", requestId: "r" }).success).toBe(
      true,
    );
    expect(errorEnvelopeSchema.safeParse({ code: "X", message: "m" }).success).toBe(false);
  });
});
