import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { colors, neutrals, radii, spacing, status as statusColors } from "../theme";
import { Text } from "../ui";

/** One piece of coursework: course, title, due date and its state in words (never color alone). */
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${courseTitle}, ${stateText}${overdue ? ", overdue" : ""}. ${dueText}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: overdue ? statusColors.error : neutrals.divider,
        borderRadius: radii.card,
        padding: spacing.md,
        gap: spacing.xs,
        backgroundColor: pressed ? neutrals.surface : colors.white,
      })}
    >
      <Text variant="caption" tone="muted">
        {courseTitle}
      </Text>
      <Text variant="subheading">{title}</Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <Text variant="caption" tone={overdue ? "error" : "muted"} style={{ flex: 1 }}>
          {overdue ? "Overdue · " : ""}
          {dueText}
        </Text>
        <Text variant="caption" tone={stateTone}>
          {stateText}
        </Text>
        <Feather name="chevron-right" size={18} color={neutrals.muted} accessible={false} />
      </View>
    </Pressable>
  );
}
