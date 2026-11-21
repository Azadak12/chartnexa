/** 4px base grid; common steps are 8, 12, 16, 24 and 32. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = { control: 12, card: 20, sheet: 24, pill: 999 } as const;

/** Minimum tappable size in points (docs/04). */
export const MIN_TOUCH_SIZE = 44;
