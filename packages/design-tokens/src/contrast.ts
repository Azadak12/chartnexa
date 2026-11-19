import { colors, market, neutrals, status } from "./colors.js";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected #RRGGBB, got ${hex}`);
  const n = parseInt(m[1] as string, 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** WCAG 2.1 contrast ratio between two #RRGGBB colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export type PairingKind = "text" | "largeText" | "control";

export interface Pairing {
  name: string;
  foreground: string;
  background: string;
  kind: PairingKind;
}

/** Minimum ratio for each kind (WCAG 2.1 AA). */
export const MIN_RATIO: Record<PairingKind, number> = { text: 4.5, largeText: 3, control: 3 };

/** Every foreground and background combination the app is allowed to use. */
export const APPROVED_PAIRINGS: readonly Pairing[] = [
  { name: "text on navy", foreground: market.onNavy, background: market.navy, kind: "text" },
  { name: "muted on navy", foreground: market.onNavyMuted, background: market.navy, kind: "text" },
  {
    name: "muted on raised navy",
    foreground: market.onNavyMuted,
    background: market.navyRaised,
    kind: "text",
  },
  { name: "blue on navy", foreground: market.blueOnNavy, background: market.navy, kind: "text" },
  { name: "up text on navy", foreground: market.upText, background: market.navy, kind: "text" },
  { name: "down text on navy", foreground: market.downText, background: market.navy, kind: "text" },
  { name: "up candle on navy", foreground: market.up, background: market.navy, kind: "control" },
  {
    name: "down candle on navy",
    foreground: market.down,
    background: market.navy,
    kind: "control",
  },
  {
    name: "chart line on navy",
    foreground: market.blueOnNavy,
    background: market.navy,
    kind: "control",
  },
  { name: "body on white", foreground: colors.black, background: colors.white, kind: "text" },
  { name: "body on surface", foreground: colors.black, background: neutrals.surface, kind: "text" },
  { name: "body on tint", foreground: colors.black, background: colors.blueTint, kind: "text" },
  { name: "muted on white", foreground: neutrals.muted, background: colors.white, kind: "text" },
  {
    name: "muted on surface",
    foreground: neutrals.muted,
    background: neutrals.surface,
    kind: "text",
  },
  { name: "muted on tint", foreground: neutrals.muted, background: colors.blueTint, kind: "text" },
  { name: "link on white", foreground: colors.blue, background: colors.white, kind: "text" },
  { name: "link on surface", foreground: colors.blue, background: neutrals.surface, kind: "text" },
  { name: "link on tint", foreground: colors.blue, background: colors.blueTint, kind: "text" },
  { name: "button label on blue", foreground: colors.white, background: colors.blue, kind: "text" },
  {
    name: "button label on pressed blue",
    foreground: colors.white,
    background: status.bluePressed,
    kind: "text",
  },
  { name: "error on white", foreground: status.error, background: colors.white, kind: "text" },
  { name: "error on tint", foreground: status.error, background: status.errorTint, kind: "text" },
  { name: "success on white", foreground: status.success, background: colors.white, kind: "text" },
  {
    name: "success on tint",
    foreground: status.success,
    background: status.successTint,
    kind: "text",
  },
  { name: "warning on white", foreground: status.warning, background: colors.white, kind: "text" },
  {
    name: "warning on tint",
    foreground: status.warning,
    background: status.warningTint,
    kind: "text",
  },
  {
    name: "control border on white",
    foreground: neutrals.border,
    background: colors.white,
    kind: "control",
  },
  {
    name: "blue control edge on white",
    foreground: colors.blue,
    background: colors.white,
    kind: "control",
  },
  { name: "icon on white", foreground: colors.black, background: colors.white, kind: "control" },
];

export function failingPairings(pairings: readonly Pairing[] = APPROVED_PAIRINGS): Pairing[] {
  return pairings.filter((p) => contrastRatio(p.foreground, p.background) < MIN_RATIO[p.kind]);
}
