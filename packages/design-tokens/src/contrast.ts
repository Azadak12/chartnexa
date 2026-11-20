import { accents, colors, market, neutrals, status } from "./colors.js";

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
const accentPairings: Pairing[] = Object.entries(accents).flatMap(([name, a]) => [
  { name: `${name} ink on its tint`, foreground: a.ink, background: a.tint, kind: "text" as const },
  {
    name: `${name} ink on surface`,
    foreground: a.ink,
    background: colors.surface,
    kind: "text" as const,
  },
  {
    name: `body on ${name} tint`,
    foreground: colors.ink,
    background: a.tint,
    kind: "text" as const,
  },
]);

export const APPROVED_PAIRINGS: readonly Pairing[] = [
  ...accentPairings,
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
  { name: "body on surface", foreground: colors.ink, background: colors.surface, kind: "text" },
  { name: "body on surface", foreground: colors.ink, background: neutrals.surface, kind: "text" },
  { name: "body on tint", foreground: colors.ink, background: colors.blueTint, kind: "text" },
  { name: "muted on surface", foreground: neutrals.muted, background: colors.surface, kind: "text" },
  {
    name: "muted on surface",
    foreground: neutrals.muted,
    background: neutrals.surface,
    kind: "text",
  },
  { name: "muted on tint", foreground: neutrals.muted, background: colors.blueTint, kind: "text" },
  { name: "link on surface", foreground: colors.link, background: colors.surface, kind: "text" },
  { name: "link on surface", foreground: colors.link, background: neutrals.surface, kind: "text" },
  { name: "link on tint", foreground: colors.link, background: colors.blueTint, kind: "text" },
  { name: "button label on blue", foreground: colors.onBlue, background: colors.blue, kind: "text" },
  { name: "label on champagne", foreground: colors.onBlue, background: colors.champagne, kind: "text" },
  { name: "champagne on surface", foreground: colors.champagne, background: colors.surface, kind: "text" },
  { name: "body on page", foreground: colors.ink, background: colors.page, kind: "text" },
  { name: "muted on page", foreground: neutrals.muted, background: colors.page, kind: "text" },
  { name: "link on page", foreground: colors.link, background: colors.page, kind: "text" },
  {
    name: "button label on pressed blue",
    foreground: colors.onBlue,
    background: status.bluePressed,
    kind: "text",
  },
  { name: "error on surface", foreground: status.error, background: colors.surface, kind: "text" },
  { name: "error on tint", foreground: status.error, background: status.errorTint, kind: "text" },
  { name: "success on surface", foreground: status.success, background: colors.surface, kind: "text" },
  {
    name: "success on tint",
    foreground: status.success,
    background: status.successTint,
    kind: "text",
  },
  { name: "warning on surface", foreground: status.warning, background: colors.surface, kind: "text" },
  {
    name: "warning on tint",
    foreground: status.warning,
    background: status.warningTint,
    kind: "text",
  },
  {
    name: "control border on surface",
    foreground: neutrals.border,
    background: colors.surface,
    kind: "control",
  },
  {
    name: "blue control edge on surface",
    foreground: colors.blue,
    background: colors.surface,
    kind: "control",
  },
  { name: "icon on surface", foreground: colors.ink, background: colors.surface, kind: "control" },
];

export function failingPairings(pairings: readonly Pairing[] = APPROVED_PAIRINGS): Pairing[] {
  return pairings.filter((p) => contrastRatio(p.foreground, p.background) < MIN_RATIO[p.kind]);
}
