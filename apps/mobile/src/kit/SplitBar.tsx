import { View } from "react-native";
import { colors, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";

export interface SplitPart {
  label: string;
  value: number;
  color: string;
}

/**
 * A proportional bar for real counts, with a labelled legend so colour never carries meaning
 * alone. Renders nothing when the total is zero (an empty chart would say nothing).
 */
export function SplitBar({
  title,
  parts,
  testID = "split-bar",
}: {
  title: string;
  parts: SplitPart[];
  testID?: string;
}) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (total <= 0) return null;
  const segments = parts
    .filter((p) => p.value > 0)
    .map((p) => ({
      label: p.label,
      style: { flexGrow: p.value, flexBasis: 0, backgroundColor: p.color },
    }));
  const summary = parts.map((p) => `${p.value} ${p.label}`).join(", ");
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${title}: ${summary}`}
      style={{
        gap: spacing.sm,
        backgroundColor: neutrals.surface,
        borderRadius: radii.card,
        padding: spacing.lg,
      }}
    >
      <Text variant="bodyStrong" style={{ color: neutrals.muted }}>
        {title}
      </Text>
      <View
        style={{
          flexDirection: "row",
          height: 12,
          borderRadius: radii.pill,
          overflow: "hidden",
          backgroundColor: colors.page,
        }}
      >
        {segments.map((seg) => (
          <View key={seg.label} testID={`${testID}-${seg.label}`} style={seg.style} />
        ))}
      </View>
      <View style={{ gap: spacing.xs }}>
        {parts.map((p) => (
          <View
            key={p.label}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
            <Text variant="caption">
              {p.label}: {p.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
