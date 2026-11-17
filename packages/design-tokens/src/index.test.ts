import { describe, expect, it } from "vitest";
import { colors } from "./index.js";

describe("brand colors", () => {
  it("matches the brand kit", () => {
    expect(colors).toEqual({
      white: "#FFFFFF",
      black: "#111111",
      blue: "#2563EB",
      blueTint: "#EFF6FF",
    });
  });
});
