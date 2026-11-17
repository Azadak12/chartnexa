import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { colors, fontFamilies, MAX_FONT_SCALE, neutrals, status, typeScale } from "../theme";
import type { TextVariant } from "@chartnexa/design-tokens";

export type TextTone = "body" | "muted" | "link" | "error" | "success" | "warning" | "onBlue";

const toneColor: Record<TextTone, string> = {
  body: colors.black,
  muted: neutrals.muted,
  link: colors.blue,
  error: status.error,
  success: status.success,
  warning: status.warning,
  onBlue: colors.white,
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

/**
 * All app text goes through here: Inter (system font if it has not loaded), scales with the
 * system text size up to 200 percent, and never sets a fixed height so large text cannot clip.
 */
export function Text({ variant = "body", tone = "body", style, ...rest }: TextProps) {
  const t = typeScale[variant];
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[
        {
          fontFamily: fontFamilies[t.weight],
          fontSize: t.size,
          lineHeight: Math.round(t.size * t.lineHeight),
          color: toneColor[tone],
        },
        style,
      ]}
      {...rest}
    />
  );
}
