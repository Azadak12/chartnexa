import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, neutrals, radii, spacing } from "../theme";
import { focusElement } from "./focus";
import { IconButton } from "./IconButton";
import { useOverlayRegistration, useOverlays } from "./overlay";
import { Text } from "./Text";
import { useReducedMotion } from "./use-reduced-motion";

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  children: ReactNode;
  /** The control that opened the sheet; focus returns to it when the sheet closes. */
  openerRef?: RefObject<unknown>;
}

function useFocusReturn(visible: boolean, openerRef?: RefObject<unknown>) {
  const wasVisible = useRef(false);
  useEffect(() => {
    if (wasVisible.current && !visible) focusElement(openerRef);
    wasVisible.current = visible;
  }, [visible, openerRef]);
}

/**
 * Short, contextual content over the current screen (ADR-0010). Back, the close button and a
 * tap on the dimmed area all dismiss it; the screen underneath is never touched.
 */
export function BottomSheet({ visible, onDismiss, title, children, openerRef }: SheetProps) {
  const reduced = useReducedMotion();
  const { dismissTop } = useOverlays();
  useOverlayRegistration(visible, onDismiss);
  useFocusReturn(visible, openerRef);
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced === false ? "slide" : "none"}
      onRequestClose={() => void dismissTop()}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.dim}
          onPress={dismissTop}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} testID="bottom-sheet">
          <View style={styles.header}>
            <Text variant="subheading" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <IconButton icon="x" accessibilityLabel={`Close ${title}`} onPress={dismissTop} />
          </View>
          <View style={styles.content}>{children}</View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** A centered confirmation; same back and focus behavior as the sheet. */
export function Dialog({ visible, onDismiss, title, children, openerRef }: SheetProps) {
  const reduced = useReducedMotion();
  const { dismissTop } = useOverlays();
  useOverlayRegistration(visible, onDismiss);
  useFocusReturn(visible, openerRef);
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced === false ? "fade" : "none"}
      onRequestClose={() => void dismissTop()}
      accessibilityViewIsModal
    >
      <View style={styles.center}>
        <View style={styles.dialog} testID="dialog">
          <Text variant="subheading" accessibilityRole="header">
            {title}
          </Text>
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: neutrals.scrim },
  dim: { flex: 1 },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { flexShrink: 1 },
  content: { gap: spacing.md, paddingTop: spacing.sm },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: neutrals.scrim,
    padding: spacing.xl,
  },
  dialog: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.md,
    alignSelf: "stretch",
  },
});
