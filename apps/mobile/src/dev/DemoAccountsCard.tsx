import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { colors, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";

/** The development-only entry on the sign-in screen. Only rendered where demo accounts are on. */
export function DemoAccountsCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Try a demo account"
      accessibilityHint="Development only: choose a demo role to sign in as"
      onPress={onPress}
      testID="demo-accounts-card"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 72,
        padding: spacing.md,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: neutrals.divider,
        backgroundColor: pressed ? neutrals.divider : colors.blueTint,
      })}
    >
      <View
        accessible={false}
        style={{
          width: 48,
          height: 48,
          borderRadius: radii.control,
          backgroundColor: colors.white,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="monitor" size={24} color={colors.blue} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption" tone="link">
          Development
        </Text>
        <Text variant="bodyStrong">Try a demo account</Text>
        <Text variant="caption" tone="muted">
          Pick a role; you still sign in normally.
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.blue} accessible={false} />
    </Pressable>
  );
}
