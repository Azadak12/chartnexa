import { centsToDollarText, formatPrice, parseDollars } from "../src/courses/money";

describe("formatPrice", () => {
  it("shows dollars, and Free for zero", () => {
    expect(formatPrice(4900)).toBe("$49.00");
    expect(formatPrice(4950)).toBe("$49.50");
    expect(formatPrice(1)).toBe("$0.01");
    expect(formatPrice(1_000_000)).toBe("$10,000.00");
    expect(formatPrice(0)).toBe("Free");
  });
});

describe("parseDollars", () => {
  it.each([
    ["49", 4900],
    ["49.5", 4950],
    ["49.50", 4950],
    ["0", 0],
    ["0.99", 99],
    ["0.1", 10],
    ["  12.34 ", 1234],
    ["10000", 1_000_000],
    ["10000.00", 1_000_000],
    ["49.", 4900],
  ])("turns %s into %d cents without rounding errors", (text, cents) => {
    expect(parseDollars(text as string)).toEqual({ ok: true, cents });
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 style traps: 1.15 * 100 is 114.99999999999999 in floating point.
    expect(parseDollars("1.15")).toEqual({ ok: true, cents: 115 });
    expect(parseDollars("4.35")).toEqual({ ok: true, cents: 435 });
  });

  it.each([
    "",
    "  ",
    "abc",
    "-5",
    "+5",
    "49,50",
    "$49",
    "49.555",
    "1e3",
    "10000.01",
    "100000",
    ".5",
    "49.5.1",
  ])("rejects %j with a reason", (text) => {
    const r = parseDollars(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(5);
  });

  it("explains the decimals rule specifically", () => {
    const r = parseDollars("49.555");
    expect(r.ok === false && r.message).toMatch(/two decimal places/);
  });
});

describe("centsToDollarText", () => {
  it("round trips with parseDollars", () => {
    for (const c of [0, 1, 99, 100, 4900, 4950, 123456, 1_000_000]) {
      expect(parseDollars(centsToDollarText(c))).toEqual({ ok: true, cents: c });
    }
  });
});
