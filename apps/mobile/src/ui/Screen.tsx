import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { OfflineBanner } from "../state/OfflineBanner";
import { useLayout } from "../layout/responsive";
import { colors, spacing } from "../theme";

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a scroll view (default true). */
  scroll?: boolean;
  padded?: boolean;
  /** Lift content above the on-screen keyboard (forms). */
  keyboard?: boolean;
  /** Pull down to refresh. The promise settles when the new data has arrived. */
  onRefresh?: () => Promise<unknown>;
}

/** White page with safe-area handling. The app is light by default (docs/04). */
export function Screen({
  children,
  scroll = true,
  padded = true,
  keyboard = false,
  onRefresh,
}: ScreenProps) {
  const [refreshing, setRefreshing] = useState(false);
  const layout = useLayout();
  const content = (
    <>
      <OfflineBanner />
      {children}
    </>
  );
  // Content is centred and capped on tablets instead of stretching a phone layout across them.
  const body = padded ? (
    <View
      style={[
        styles.padded,
        {
          paddingHorizontal: layout.gutter,
          maxWidth: layout.contentMaxWidth,
          width: "100%",
          alignSelf: "center",
        },
      ]}
    >
      {content}
    </View>
  ) : (
    content
  );
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={styles.grow}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void onRefresh().finally(() => setRefreshing(false));
            }}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        ) : undefined
      }
    >
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
  root: { flex: 1, backgroundColor: colors.page },
  grow: { flexGrow: 1 },
  padded: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, flexGrow: 1 },
});
