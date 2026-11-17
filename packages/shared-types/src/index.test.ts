import { describe, expect, it } from "vitest";
import { ROLES } from "./index.js";

describe("ROLES", () => {
  it("lists the four confirmed roles", () => {
    expect(ROLES).toEqual(["student", "instructor", "manager", "admin"]);
  });
});
