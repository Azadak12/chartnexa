import { describe, expect, it } from "vitest";
import {
  APPROVED_PAIRINGS,
  colors,
  contrastRatio,
  failingPairings,
  MIN_RATIO,
  MIN_TOUCH_SIZE,
  neutrals,
  radii,
  spacing,
  status,
  typeScale,
} from "./index.js";

describe("brand colors", () => {
  it("match the reference-derived dark palette exactly", () => {
    expect(colors).toEqual({
      page: "#070B14",
      surface: "#0F1628",
      ink: "#E8EEFB",
      blue: "#3D8BFF",
      blueTint: "#13203D",
      onBlue: "#0B1020",
      gold: "#F5C542",
      goldTint: "#33270B",
    });
  });

  it("keeps every other color a neutral or a functional status color", () => {
    const all = [...Object.values(neutrals), ...Object.values(status)];
    for (const c of all) expect(c).toMatch(/^(#[0-9A-F]{6}|rgba\(3, 6, 12, 0\.7\))$/i);
    expect(Object.keys(colors)).toHaveLength(8);
  });
});

describe("contrast", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio(colors.blue, colors.surface)).toBeGreaterThan(5);
  });

  it("holds for every approved pairing at its required ratio", () => {
    expect(failingPairings()).toEqual([]);
    for (const p of APPROVED_PAIRINGS) {
      expect(contrastRatio(p.foreground, p.background), p.name).toBeGreaterThanOrEqual(
        MIN_RATIO[p.kind],
      );
    }
    expect(
      APPROVED_PAIRINGS.filter((p) => p.kind === "text").every((p) => MIN_RATIO[p.kind] === 4.5),
    ).toBe(true);
  });

  it("detects a pairing that is too faint", () => {
    const bad = [
      { name: "faint", foreground: "#2B3A5E", background: colors.surface, kind: "text" as const },
    ];
    expect(failingPairings(bad)).toHaveLength(1);
    const faintBorder = [
      {
        name: "faint border",
        foreground: "#1F2B47",
        background: colors.surface,
        kind: "control" as const,
      },
    ];
    expect(failingPairings(faintBorder)).toHaveLength(1);
  });

  it("rejects malformed colors", () => {
    expect(() => contrastRatio("red", "#FFFFFF")).toThrow();
  });
});

describe("layout tokens", () => {
  it("use a 4px grid, 12px controls, 16px cards and a 44pt touch target", () => {
    for (const v of Object.values(spacing)) expect(v % 4).toBe(0);
    expect(radii.control).toBe(12);
    expect(radii.card).toBe(16);
    expect(MIN_TOUCH_SIZE).toBe(44);
  });

  it("express line height as ratios so text can scale", () => {
    for (const t of Object.values(typeScale)) {
      expect(t.lineHeight).toBeGreaterThan(1);
      expect(t.lineHeight).toBeLessThan(2);
    }
  });
});
