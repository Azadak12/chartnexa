import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, neutrals, radii, spacing } from "../theme";

export function Card({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
