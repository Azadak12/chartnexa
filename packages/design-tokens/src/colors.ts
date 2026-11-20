/**
 * Dark-first fintech palette adopted from the client's trading-academy reference (owner decision,
 * 2026-11-21; supersedes the white/black/blue kit in docs/04): deep navy surfaces, electric blue
 * primary, gold for rewards. `surface` is the card colour, `page` the screen behind it, `ink` the
 * primary text, `onBlue` the dark text and icons placed on a blue or gold fill.
 */
export const colors = {
  page: "#070B14",
  surface: "#0F1628",
  ink: "#E8EEFB",
  blue: "#3D8BFF",
  blueTint: "#13203D",
  onBlue: "#0B1020",
  gold: "#F5C542",
  goldTint: "#33270B",
} as const;

/** Neutrals derived for borders, raised surfaces and muted text. */
export const neutrals = {
  /** A raised surface: inputs, secondary panels. */
  surface: "#141D33",
  /** Decorative dividers and card edges; not used as the only boundary of a control. */
  divider: "#1F2B47",
  /** Control borders: at least 3:1 on the surface. */
  border: "#6B7BA3",
  /** Secondary text: at least 4.5:1 on the page, the surface and the tint. */
  muted: "#9AA8C7",
  /** Disabled controls are exempt from contrast rules but must still be legible. */
  disabledText: "#6B7A9E",
  disabledFill: "#141D33",
  /** Dimmed backdrop behind sheets and dialogs. */
  scrim: "rgba(3, 6, 12, 0.7)",
} as const;

/** Functional status colors. Always shown with an icon or text label, never alone. */
export const status = {
  error: "#F87171",
  errorTint: "#3A1620",
  success: "#4ADE80",
  successTint: "#10301E",
  warning: "#F5C542",
  warningTint: "#33270B",
  /** Pressed state of the primary blue (lighter: the screen is dark). */
  bluePressed: "#6FB0FF",
  /** The darker lower edge of raised blue buttons and path nodes. */
  blueLip: "#2563EB",
} as const;

/**
 * Chart and "market learning" surfaces (Phase 2 design). The navy surface is reserved for charts
 * and hero panels. Up and down colours are for meaningful price direction only and are always
 * paired with a symbol or word. `upText` and `downText` are the lighter text versions that meet
 * 4.5:1 on the navy surface; `up` and `down` are for filled shapes (3:1).
 */
export const market = {
  navy: "#0F172A",
  navyRaised: "#1E293B",
  grid: "#334155",
  onNavy: "#F8FAFC",
  onNavyMuted: "#94A3B8",
  blueOnNavy: "#60A5FA",
  up: "#10B981",
  down: "#EF4444",
  upText: "#34D399",
  downText: "#F87171",
} as const;

/**
 * Accent pairs for dashboards: an `ink` colour for icons and labels and a soft `tint` behind it.
 * Each pair meets 4.5:1 (see contrast.ts), so the ink can carry text as well as icons. Colour is
 * always shown with an icon and words, never alone. Sky is the secondary accent next to brand blue.
 */
export const accents = {
  blue: { ink: "#8AB8FF", tint: "#13203D" },
  sky: { ink: "#7DD3FC", tint: "#0C2A3D" },
  emerald: { ink: "#6EE7B7", tint: "#0F2F25" },
  amber: { ink: "#FCD34D", tint: "#33270B" },
  purple: { ink: "#C4B5FD", tint: "#271B4D" },
} as const;
export type AccentName = keyof typeof accents;
