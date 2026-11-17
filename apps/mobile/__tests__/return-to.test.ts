import { buildReturnTo, sanitizeReturnTo } from "../src/navigation/return-to";

describe("sanitizeReturnTo", () => {
  it("accepts internal routes with parameters", () => {
    for (const ok of [
      "/home",
      "/courses/42",
      "/courses/42?tab=reviews&x=1",
      "/(app)/(tabs)/home",
    ]) {
      expect(sanitizeReturnTo(ok)).toBe(ok);
    }
  });

  it("rejects everything else", () => {
    const bad = [
      undefined,
      null,
      42,
      "",
      "home",
      "https://evil.example",
      "//evil.example",
      "chartnexa://home",
      "javascript:alert(1)",
      "/home\\x",
      "/a/../b",
      "/ok\u0000bad",
      "/ok\nbad",
      "/sign-in",
      "/sign-in/extra",
      "/welcome",
      "/has space",
      "/<script>",
      `/${"a".repeat(600)}`,
    ];
    for (const b of bad) expect(sanitizeReturnTo(b)).toBeNull();
  });
});

describe("buildReturnTo", () => {
  it("joins path and encoded query", () => {
    expect(buildReturnTo("/courses/42", { tab: "reviews", skip: undefined })).toBe(
      "/courses/42?tab=reviews",
    );
    expect(buildReturnTo("/home", {})).toBe("/home");
    expect(buildReturnTo("/x", { a: ["1", "2"] })).toBe("/x?a=1&a=2");
  });
});
