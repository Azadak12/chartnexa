import { View } from "react-native";
import { colors, neutrals, spacing } from "../theme";
import { Text } from "../ui";

/** "3 of 8 lessons complete" in text, with a thin bar that never carries the meaning alone. */
export function progressLabel(completed: number, total: number): string {
  if (total === 0) return "No lessons yet";
  return `${completed} of ${total} lessons complete`;
}

export function ProgressBar({
  completed,
  total,
  testID,
}: {
  completed: number;
  total: number;
  testID?: string;
}) {
  const label = progressLabel(completed, total);
  const pct = total === 0 ? 0 : Math.min(1, completed / total);
  return (
    <View style={{ gap: spacing.xs }} testID={testID}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      {total > 0 ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: total, now: Math.min(completed, total) }}
          style={{ height: 4, borderRadius: 2, backgroundColor: neutrals.divider }}
        >
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.blue,
              width: `${pct * 100}%`,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
