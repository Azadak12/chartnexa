import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import type { CourseLevel } from "@chartnexa/api-contracts";
import { COURSE_LEVELS } from "@chartnexa/api-contracts";
import { LEVEL_LABEL } from "../courses/CourseCard";
import { colors, MIN_TOUCH_SIZE, neutrals, spacing } from "../theme";
import { BottomSheet, Button, Text } from "../ui";

export interface FilterValue {
  level: CourseLevel | null;
  category: string | null;
}

function Radio<T extends string | null>({
  label,
  value,
  current,
  onSelect,
  testID,
}: {
  label: string;
  value: T;
  current: T;
  onSelect: (v: T) => void;
  testID: string;
}) {
  const checked = value === current;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => onSelect(value)}
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: MIN_TOUCH_SIZE,
        paddingVertical: spacing.xs,
      }}
    >
      <Feather
        name={checked ? "check-circle" : "circle"}
        size={22}
        color={checked ? colors.blue : neutrals.muted}
        accessible={false}
      />
      <Text style={{ flex: 1 }} variant={checked ? "bodyStrong" : "body"}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Difficulty and category as two radio groups in one bottom sheet. Choices are held as a draft and
 * only change the list on Apply; Reset clears the draft. Long category lists scroll inside the
 * sheet, and the keyboard is closed when it opens so it cannot cover the buttons.
 */
export function FilterSheet({
  visible,
  onClose,
  value,
  categories,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  value: FilterValue;
  categories: { id: string; name: string }[];
  onApply: (v: FilterValue) => void;
}) {
  const [draft, setDraft] = useState<FilterValue>(value);
  const { height } = useWindowDimensions();
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setDraft(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return (
    <BottomSheet visible={visible} onDismiss={onClose} title="Filters">
      <ScrollView
        style={{ maxHeight: Math.round(height * 0.55) }}
        contentContainerStyle={{ gap: spacing.lg }}
        testID="filter-scroll"
      >
        <View accessibilityRole="radiogroup" style={{ gap: 2 }}>
          <Text variant="bodyStrong" accessibilityRole="header">
            Difficulty
          </Text>
          <Radio
            label="All"
            value={null}
            current={draft.level}
            onSelect={(level) => setDraft({ ...draft, level })}
            testID="level-all"
          />
          {COURSE_LEVELS.map((l) => (
            <Radio
              key={l}
              label={LEVEL_LABEL[l]}
              value={l}
              current={draft.level}
              onSelect={(level) => setDraft({ ...draft, level })}
              testID={`level-${l}`}
            />
          ))}
        </View>
        <View accessibilityRole="radiogroup" style={{ gap: 2 }}>
          <Text variant="bodyStrong" accessibilityRole="header">
            Category
          </Text>
          <Radio
            label="All categories"
            value={null}
            current={draft.category}
            onSelect={(category) => setDraft({ ...draft, category })}
            testID="category-all"
          />
          {categories.map((c) => (
            <Radio
              key={c.id}
              label={c.name}
              value={c.id}
              current={draft.category}
              onSelect={(category) => setDraft({ ...draft, category })}
              testID={`category-${c.id}`}
            />
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Reset Filters"
            variant="secondary"
            onPress={() => setDraft({ level: null, category: null })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Apply Filters"
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
