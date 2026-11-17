import { describe, expect, it } from "vitest";
import { isRole } from "./index.js";

describe("isRole", () => {
  it("accepts known roles and rejects others", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("root")).toBe(false);
  });
});
