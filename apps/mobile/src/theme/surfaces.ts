import { colors, neutrals, radii } from "@chartnexa/design-tokens";

/**
 * The one raised-card look: a surface with a hairline edge and a soft shadow beneath, as in the
 * reference academy app, so cards sit above the page the same way in every role. Spread it, then
 * add layout (padding, gap).
 */
export const raised = {
  backgroundColor: colors.surface,
  borderRadius: radii.card,
  borderWidth: 1,
  borderColor: neutrals.divider,
  shadowColor: "black",
  shadowOpacity: 0.45,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
} as const;
