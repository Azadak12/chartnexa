import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { raised, spacing } from "../theme";

export function Card({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...raised,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
