import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { OfflineBanner } from "../state/OfflineBanner";
import { colors, spacing } from "../theme";

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a scroll view (default true). */
  scroll?: boolean;
  padded?: boolean;
  /** Lift content above the on-screen keyboard (forms). */
  keyboard?: boolean;
}

/** White page with safe-area handling. The app is light by default (docs/04). */
export function Screen({ children, scroll = true, padded = true, keyboard = false }: ScreenProps) {
  const content = (
    <>
      <OfflineBanner />
      {children}
    </>
  );
  const body = padded ? <View style={styles.padded}>{content}</View> : content;
  const inner = scroll ? (
    <ScrollView contentContainerStyle={styles.grow} keyboardShouldPersistTaps="handled">
      {body}
    </ScrollView>
  ) : (
    body
  );
  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]} testID="screen">
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  grow: { flexGrow: 1 },
  padded: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, flexGrow: 1 },
});
