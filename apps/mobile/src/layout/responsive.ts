import { useWindowDimensions } from "react-native";

/** Width breakpoints in dp. Phones are below `tablet`. */
export const BREAKPOINTS = { compact: 360, tablet: 600, wide: 900 } as const;

export interface LayoutInfo {
  width: number;
  /** At least 600dp wide: tablets and large foldables. */
  isTablet: boolean;
  /** Side margin shared by every screen. */
  gutter: number;
  /** Content never stretches wider than this; it is centred instead. */
  contentMaxWidth: number;
  /** Columns for card grids. */
  columns: 1 | 2 | 3;
}

/** One source of truth for gutters and widths, so every screen lines up on every device. */
export function layoutFor(width: number): LayoutInfo {
  const isTablet = width >= BREAKPOINTS.tablet;
  return {
    width,
    isTablet,
    gutter: width < BREAKPOINTS.compact ? 16 : isTablet ? 32 : 20,
    contentMaxWidth: width >= BREAKPOINTS.wide ? 840 : isTablet ? 720 : width,
    columns: width >= BREAKPOINTS.wide ? 3 : isTablet ? 2 : 1,
  };
}

export function useLayout(): LayoutInfo {
  return layoutFor(useWindowDimensions().width);
}
