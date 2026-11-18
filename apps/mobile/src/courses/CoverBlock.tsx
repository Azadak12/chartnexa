import { Feather } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import type { CourseTone } from "@chartnexa/api-contracts";
import { colors, radii } from "../theme";

const tones: Record<CourseTone, { bg: string; fg: string }> = {
  blue: { bg: colors.blue, fg: colors.white },
  black: { bg: colors.black, fg: colors.white },
  tint: { bg: colors.blueTint, fg: colors.blue },
};

/** The cover is one of three brand tones with an icon; no uploaded images yet. */
export function CoverBlock({ tone, height = 96 }: { tone: CourseTone; height?: number }) {
  const t = tones[tone];
  return (
    <View
      style={[styles.block, { backgroundColor: t.bg, height }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="cover"
    >
      <Feather name="trending-up" size={Math.round(height / 2.5)} color={t.fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
});
