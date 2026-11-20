import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { colors, neutrals, raised, spacing, status as statusColors } from "../theme";
import { StatusPill, Text, type PillTone } from "../ui";
import { PressableCard } from "./PressableCard";

const PILL: Record<
  "link" | "success" | "muted",
  { tone: PillTone; icon: "clock" | "check-circle" | "circle" }
> = {
  link: { tone: "info", icon: "clock" },
  success: { tone: "success", icon: "check-circle" },
  muted: { tone: "neutral", icon: "circle" },
};

/** A mission card: course, title, due date, and its state as a labelled pill (never colour alone). */
export function AssignmentCard({
  title,
  courseTitle,
  stateText,
  stateTone,
  dueText,
  overdue,
  onPress,
  testID,
}: {
  title: string;
  courseTitle: string;
  stateText: string;
  stateTone: "link" | "success" | "muted";
  dueText: string;
  overdue: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const pill = PILL[stateTone];
  const rail = overdue
    ? statusColors.error
    : stateTone === "success"
      ? statusColors.success
      : colors.blue;
  return (
    <PressableCard
      accessibilityLabel={`${title}, ${courseTitle}, ${stateText}${overdue ? ", overdue" : ""}. ${dueText}`}
      onPress={onPress}
      testID={testID}
      minHeight={96}
      pressedStyle={{ borderColor: colors.blue }}
      style={{
        ...raised,
        borderColor: overdue ? statusColors.error : neutrals.divider,
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      <View accessible={false} style={{ width: 5, backgroundColor: rail }} />
      <View style={{ flex: 1, minWidth: 0, padding: spacing.md, gap: spacing.xs }}>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {courseTitle}
        </Text>
        <Text variant="subheading">{title}</Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}
        >
          <StatusPill label={stateText} tone={pill.tone} icon={pill.icon} />
          <Text variant="caption" tone={overdue ? "error" : "muted"} style={{ flex: 1 }}>
            {overdue ? "Overdue · " : ""}
            {dueText}
          </Text>
          <Feather name="chevron-right" size={18} color={neutrals.muted} accessible={false} />
        </View>
      </View>
    </PressableCard>
  );
}
