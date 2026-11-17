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
  /** Keep content in a centered column no wider than 480 points (forms and welcome on large screens). */
  narrow?: boolean;
  /** Center content vertically and its text horizontally (welcome and confirmation screens). */
  hero?: boolean;
}

/** White page with safe-area handling. The app is light by default (docs/04). */
export function Screen({
  children,
  scroll = true,
  padded = true,
  keyboard = false,
  narrow = false,
  hero = false,
}: ScreenProps) {
  const content = (
    <>
      <OfflineBanner />
      {children}
    </>
  );
  const column = padded ? (
    <View style={[styles.padded, hero && styles.hero, narrow && styles.narrow]}>{content}</View>
  ) : (
    content
  );
  const body = column;
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
  padded: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  // Text stays left-aligned with its labels and fields; only hero screens center.
  hero: { justifyContent: "center", alignItems: "stretch" },
  narrow: { width: "100%", maxWidth: 480, alignSelf: "center" },
});
