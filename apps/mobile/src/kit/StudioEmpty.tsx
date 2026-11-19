import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { accents, radii, spacing } from "../theme";
import { Button, Skeleton, Text } from "../ui";

/** A friendly empty state: an icon on a soft tint, what is missing, and one action when there is one. */
export function StudioEmpty({
  icon = "bar-chart-2",
  title,
  message,
  actionLabel,
  onAction,
  testID = "studio-empty",
}: {
  icon?: React.ComponentProps<typeof Feather>["name"];
  title: string;
  message: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{ alignItems: "center", gap: spacing.md, padding: spacing.xl, minWidth: 0 }}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 72,
          height: 72,
          borderRadius: radii.pill,
          backgroundColor: accents.blue.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={30} color={accents.blue.ink} />
      </View>
      <Text variant="subheading" accessibilityRole="header" style={{ textAlign: "center" }}>
        {title}
      </Text>
      <Text tone="muted" style={{ textAlign: "center" }}>
        {message}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

/** The same shape as a course card while it loads, so nothing jumps when the real ones arrive. */
export function CourseCardSkeleton() {
  return (
    <View
      testID="course-skeleton"
      accessibilityLabel="Loading course"
      style={{
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.sm,
        borderRadius: radii.card,
        backgroundColor: accents.blue.tint,
      }}
    >
      <Skeleton width={96} height={54} />
      <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
        <Skeleton width={72} height={16} />
        <Skeleton width="85%" height={16} />
        <Skeleton width="40%" height={14} />
      </View>
    </View>
  );
}
