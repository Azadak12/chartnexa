/**
 * ChartNexa Cinematic Interactive Academy, Design System V1 (owner brief, 2026-11-21; supersedes
 * the first trading-academy-derived palette). `page` is Primary Midnight, `surface` Deep Navy,
 * `blue` the primary action colour (fills, selected states), `link` its lighter text form (the
 * action blue is 4.2:1 on the surface, so it is not used for small text), `champagne` a premium
 * editorial highlight (never a profit signal), `ink` Ice White. `onBlue` is the dark text and
 * icon colour placed on blue or champagne fills.
 */
export const colors = {
  page: "#07111F",
  surface: "#101D32",
  ink: "#F5F8FC",
  blue: "#2878FF",
  link: "#6EA8FF",
  blueTint: "#12284D",
  onBlue: "#07111F",
  champagne: "#D8AD66",
  champagneTint: "#2E2412",
} as const;

/** Neutrals derived for borders, elevated surfaces and muted text. */
export const neutrals = {
  /** Elevated surface: inputs, secondary panels. */
  surface: "#192A42",
  /** Decorative dividers and card edges; not used as the only boundary of a control. */
  divider: "#243750",
  /** Control borders: at least 3:1 on the surface. */
  border: "#7388A8",
  /** Secondary text: at least 4.5:1 on the page, the surface and the elevated surface. */
  muted: "#9DAFC5",
  /** Disabled controls are exempt from contrast rules but must still be legible. */
  disabledText: "#6B7E99",
  disabledFill: "#192A42",
  /** Dimmed backdrop behind sheets and dialogs. */
  scrim: "rgba(3, 6, 12, 0.7)",
} as const;

/** Functional status colors. Always shown with an icon or text label, never alone. */
export const status = {
  error: "#F16B72",
  errorTint: "#3A1A24",
  success: "#16B89A",
  successTint: "#0D2F2B",
  warning: "#D8AD66",
  warningTint: "#2E2412",
  /** Pressed state of the primary blue (lighter: the screen is dark). */
  bluePressed: "#5B9BFF",
  /** The darker lower edge of raised blue buttons and path nodes. */
  blueLip: "#1B5BD1",
} as const;

/**
 * Chart and "market learning" surfaces. The navy surface is reserved for charts and hero panels.
 * Bullish green and bearish coral are for meaningful price direction only and are always paired
 * with a symbol or word. `upText` and `downText` are the text versions on navy.
 */
export const market = {
  navy: "#0B1829",
  navyRaised: "#192A42",
  grid: "#2A3D5C",
  onNavy: "#F5F8FC",
  onNavyMuted: "#9DAFC5",
  blueOnNavy: "#6EA8FF",
  up: "#16B89A",
  down: "#F16B72",
  upText: "#16B89A",
  downText: "#F16B72",
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
