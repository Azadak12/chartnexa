import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { colors, MIN_TOUCH_SIZE, spacing } from "../theme";
import { Text } from "../ui";

/**
 * A top-left back arrow for pushed screens. It goes back one step when there is a step to go back
 * to, and otherwise (a deep link, a restored session) to the given parent, so nobody is trapped.
 */
export function BackButton({
  onPress,
  title,
  testID = "back-button",
}: {
  onPress: () => void;
  /** The parent's name, shown beside the arrow: "Explore". */
  title?: string;
  testID?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title ? `Go back to ${title}` : "Go back"}
        onPress={onPress}
        testID={testID}
        hitSlop={6}
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH_SIZE,
          minWidth: MIN_TOUCH_SIZE,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          paddingHorizontal: spacing.sm,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Feather name="chevron-left" size={26} color={colors.blue} accessible={false} />
        {title ? (
          <Text variant="bodyStrong" tone="link">
            {title}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}
