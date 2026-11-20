import { Pressable, View } from "react-native";
import { type ReviewReason } from "@chartnexa/api-contracts";
import { colors, MIN_TOUCH_SIZE, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";
import { REASON_LABEL, REASON_ORDER } from "./moderation-labels";

/** One reason at a time, as a radio group. Selection shows as a filled dot and as a spoken state. */
export function ReasonPicker({
  value,
  onChange,
  error,
}: {
  value: ReviewReason | null;
  onChange: (r: ReviewReason) => void;
  error?: string | undefined;
}) {
  return (
    <View accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
      {REASON_ORDER.map((r) => {
        const on = value === r;
        return (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityLabel={REASON_LABEL[r]}
            accessibilityState={{ checked: on, selected: on }}
            onPress={() => onChange(r)}
            testID={`reason-${r}`}
            style={{
              minHeight: MIN_TOUCH_SIZE,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radii.card,
              borderWidth: 1,
              borderColor: on ? colors.blue : neutrals.divider,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: on ? colors.blue : colors.ink,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {on ? (
                <View
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue }}
                />
              ) : null}
            </View>
            <Text variant={on ? "bodyStrong" : "body"}>{REASON_LABEL[r]}</Text>
          </Pressable>
        );
      })}
      {error ? (
        <Text variant="caption" tone="error" accessibilityRole="alert" testID="reason-pick-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
