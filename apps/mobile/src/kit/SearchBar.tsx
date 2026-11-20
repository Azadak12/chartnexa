import { Feather } from "@expo/vector-icons";
import { Pressable, TextInput, View } from "react-native";
import { colors, MAX_FONT_SCALE, neutrals, radii, spacing } from "../theme";

/** A search field with a clear button. Returns text as typed; the screen decides when to search. */
export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search courses",
  label = "Search courses",
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: 48,
        paddingHorizontal: spacing.md,
        borderRadius: radii.control,
        backgroundColor: neutrals.surface,
        borderWidth: 1,
        borderColor: neutrals.divider,
      }}
    >
      <Feather name="search" size={18} color={neutrals.muted} accessible={false} />
      <TextInput
        accessibilityLabel={label}
        accessibilityRole="search"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={neutrals.muted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ flex: 1, color: colors.ink, fontSize: 16, paddingVertical: 10 }}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          hitSlop={10}
          testID="search-clear"
        >
          <Feather name="x-circle" size={20} color={neutrals.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
