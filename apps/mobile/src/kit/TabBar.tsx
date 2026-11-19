import { Pressable, View } from "react-native";
import { colors, neutrals, spacing } from "../theme";
import { Text } from "../ui";

/** Underlined tabs for switching sections of one screen. Selected state is announced and shown with weight and an underline. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: neutrals.divider }}
    >
      {tabs.map((t) => {
        const selected = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(t.key)}
            testID={`tab-${t.key}`}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: spacing.xs,
              borderBottomWidth: 3,
              borderBottomColor: selected ? colors.blue : "transparent",
            }}
          >
            <Text
              variant="caption"
              numberOfLines={2}
              style={{
                textAlign: "center",
                color: selected ? colors.blue : neutrals.muted,
                fontWeight: selected ? "700" : "500",
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
