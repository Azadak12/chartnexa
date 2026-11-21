/**
 * ChartNexa colours, aligned to the owner's trading-academy reference app (2026-11-21): deep navy
 * and charcoal surfaces, electric-blue primary, gold highlight, green for gains and red for
 * losses. `page` is the app background, `surface` the card colour, `blue` the primary action
 * colour (fills, selected states), `link` its lighter text form, `champagne` the gold highlight
 * (the key keeps its earlier name; it is never a profit signal), `ink` the main text colour.
 * `onBlue` is the dark text and icon colour placed on blue or gold fills.
 */
export const colors = {
  page: "#070B14",
  surface: "#0F1628",
  ink: "#E8EEFB",
  blue: "#3D8BFF",
  link: "#6FA8FF",
  blueTint: "#16284A",
  onBlue: "#070B14",
  champagne: "#F5C542",
  champagneTint: "#33270B",
} as const;

/** Neutrals derived for borders, elevated surfaces and muted text. */
export const neutrals = {
  /** Elevated surface: inputs, secondary panels. */
  surface: "#141D33",
  /** Decorative dividers and card edges; not used as the only boundary of a control. */
  divider: "#1F2B47",
  /** Control borders: at least 3:1 on the surface. */
  border: "#5E6F96",
  /** Secondary text: at least 4.5:1 on the page, the surface and the elevated surface. */
  muted: "#8696B8",
  /** Disabled controls are exempt from contrast rules but must still be legible. */
  disabledText: "#56658A",
  disabledFill: "#141D33",
  /** Dimmed backdrop behind sheets and dialogs. */
  scrim: "rgba(3, 6, 12, 0.7)",
} as const;

/** Functional status colors. Always shown with an icon or text label, never alone. */
export const status = {
  error: "#F87171",
  errorTint: "#3A1A24",
  success: "#22C55E",
  successTint: "#0D2F23",
  warning: "#F5C542",
  warningTint: "#33270B",
  /** Pressed state of the primary blue (lighter: the screen is dark). */
  bluePressed: "#5C9DFF",
  /** The darker lower edge of raised blue buttons and path nodes. */
  blueLip: "#2563EB",
} as const;

/**
 * Chart and "market learning" surfaces. The navy surface is reserved for charts and hero panels.
 * Bullish green and bearish coral are for meaningful price direction only and are always paired
 * with a symbol or word. `upText` and `downText` are the text versions on navy.
 */
export const market = {
  navy: "#0A1020",
  navyRaised: "#141D33",
  grid: "#1F2B47",
  onNavy: "#E8EEFB",
  onNavyMuted: "#B7C3DC",
  blueOnNavy: "#8AB8FF",
  up: "#22C55E",
  down: "#F87171",
  upText: "#22C55E",
  downText: "#F87171",
} as const;

/**
 * Accent pairs for dashboards: an `ink` colour for icons and labels and a soft `tint` behind it.
 * Each pair meets 4.5:1 (see contrast.ts), so the ink can carry text as well as icons. Colour is
 * always shown with an icon and words, never alone. Sky is the secondary accent next to brand blue.
 */
export const accents = {
  blue: { ink: "#8AB8FF", tint: "#13203D" },
  sky: { ink: "#67E8F9", tint: "#0B2A36" },
  emerald: { ink: "#6EE7B7", tint: "#0D2F23" },
  amber: { ink: "#F5C542", tint: "#33270B" },
  purple: { ink: "#C4B5FD", tint: "#271B4D" },
} as const;
export type AccentName = keyof typeof accents;
