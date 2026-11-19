import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { colors, neutrals, radii, spacing, status } from "../theme";
import { Text } from "../ui";

/** A module header that expands to show its lessons. State is announced to screen readers. */
export function ModuleAccordion({
  title,
  summary,
  defaultOpen = false,
  children,
  testID,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  testID?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View
      style={{
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: neutrals.divider,
        overflow: "hidden",
        backgroundColor: colors.white,
      }}
      testID={testID}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${summary}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          padding: spacing.md,
          minHeight: 56,
          backgroundColor: pressed ? neutrals.surface : colors.white,
        })}
      >
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" tone="muted">
            {summary}
          </Text>
        </View>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={neutrals.muted}
          accessible={false}
        />
      </Pressable>
      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: neutrals.divider }}>{children}</View>
      ) : null}
    </View>
  );
}

type LessonState = "preview" | "open" | "locked" | "done";
const ICON: Record<LessonState, React.ComponentProps<typeof Feather>["name"]> = {
  preview: "play-circle",
  open: "circle",
  locked: "lock",
  done: "check-circle",
};
const WORD: Record<LessonState, string> = {
  preview: "Free preview",
  open: "Open",
  locked: "Locked",
  done: "Completed",
};

/** One lesson row with a state that is always shown in words as well as with an icon. */
export function LessonCard({
  title,
  position,
  state,
  onPress,
  testID,
  label,
  statusText,
  hint,
  statusTestID,
}: {
  title: string;
  position: number;
  state: LessonState;
  onPress: () => void;
  testID?: string;
  /** Overrides the spoken label. */
  label?: string;
  /** Overrides the visible state word. */
  statusText?: string;
  hint?: string;
  statusTestID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? `Lesson ${position}, ${title}, ${WORD[state]}`}
      accessibilityHint={hint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        minHeight: 52,
        backgroundColor: pressed ? neutrals.surface : colors.white,
      })}
    >
      <Feather
        name={ICON[state]}
        size={20}
        color={
          state === "done"
            ? status.success
            : state === "locked"
              ? neutrals.disabledText
              : colors.blue
        }
        accessible={false}
      />
      <View style={{ flex: 1 }}>
        <Text
          variant="bodyStrong"
          style={{ color: state === "locked" ? neutrals.muted : colors.black }}
        >
          {position}. {title}
        </Text>
      </View>
      <Text
        variant="caption"
        testID={state === "done" ? statusTestID : undefined}
        tone={state === "done" ? "success" : state === "preview" ? "link" : "muted"}
      >
        {statusText ?? WORD[state]}
      </Text>
    </Pressable>
  );
}
