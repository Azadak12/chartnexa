import { colors, neutrals, radii } from "@chartnexa/design-tokens";

/**
 * The one raised-card look: a surface with a hairline edge and a thicker lower edge, so cards sit
 * above the page the same way in every role. Spread it, then add layout (padding, gap).
 */
export const raised = {
  backgroundColor: colors.surface,
  borderRadius: radii.card,
  borderWidth: 1,
  borderColor: neutrals.divider,
  borderBottomWidth: 4,
} as const;
