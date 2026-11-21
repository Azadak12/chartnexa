/** Largest system text scale the app supports without clipping (200 percent). */
export const MAX_FONT_SCALE = 2;

export const fontFamilies = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  /** Headings: Plus Jakarta Sans, the reference app's display face. */
  display: "PlusJakartaSans_700Bold",
  displayHeavy: "PlusJakartaSans_800ExtraBold",
} as const;

export type TextVariant =
  "title" | "heading" | "subheading" | "body" | "bodyStrong" | "caption" | "button";

/** Sizes in points; line heights are ratios so text scales without clipping. */
export const typeScale: Record<
  TextVariant,
  { size: number; lineHeight: number; weight: keyof typeof fontFamilies }
> = {
  title: { size: 28, lineHeight: 1.25, weight: "displayHeavy" },
  heading: { size: 22, lineHeight: 1.3, weight: "display" },
  subheading: { size: 18, lineHeight: 1.35, weight: "display" },
  body: { size: 17, lineHeight: 1.5, weight: "regular" },
  bodyStrong: { size: 17, lineHeight: 1.5, weight: "medium" },
  caption: { size: 14, lineHeight: 1.45, weight: "regular" },
  button: { size: 16, lineHeight: 1.25, weight: "semibold" },
};

/** Text counts as large (3:1 rule) from 24pt, or 18.66pt when bold (WCAG 2.1). */
export const LARGE_TEXT_SIZE = 24;
export const LARGE_BOLD_TEXT_SIZE = 18.66;
