/** The three brand hues plus the blue tint (docs/04_BRAND_AND_UX.md). */
export const colors = {
  white: "#FFFFFF",
  black: "#111111",
  blue: "#2563EB",
  blueTint: "#EFF6FF",
} as const;

/** Neutrals derived for borders, surfaces and muted text. */
export const neutrals = {
  surface: "#F9FAFB",
  /** Decorative dividers; not used as the only boundary of a control. */
  divider: "#E4E7EC",
  /** Control borders: at least 3:1 on white. */
  border: "#7A8394",
  /** Secondary text: at least 4.5:1 on white and on the tint. */
  muted: "#475467",
  /** Disabled controls are exempt from contrast rules but must still be legible. */
  disabledText: "#98A2B3",
  disabledFill: "#F2F4F7",
  /** Dimmed backdrop behind sheets and dialogs (the brand black at 45 percent). */
  scrim: "rgba(17, 17, 17, 0.45)",
} as const;

/** Functional status colors. Always shown with an icon or text label, never alone. */
export const status = {
  error: "#B42318",
  errorTint: "#FEF3F2",
  success: "#067647",
  successTint: "#ECFDF3",
  warning: "#B54708",
  warningTint: "#FFFAEB",
  /** Pressed state of the primary blue. */
  bluePressed: "#1D4ED8",
} as const;
