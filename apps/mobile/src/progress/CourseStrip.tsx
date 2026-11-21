import { Feather } from "@expo/vector-icons";
import { FlatList, View } from "react-native";
import type { MyCourse } from "@chartnexa/api-contracts";
import { PressableCard } from "../kit/PressableCard";
import { colors, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";

const isDone = (c: MyCourse) => c.progress.total > 0 && c.progress.completed >= c.progress.total;

/**
 * A sideways row with one card per owned course: its position, title and a progress bar from the
 * student's real lesson progress. `selectedId` outlines the active card; `onSelect` receives a press.
 */
export function CourseStrip({
  courses,
  selectedId,
  onSelect,
}: {
  courses: MyCourse[];
  selectedId?: string | undefined;
  onSelect: (course: MyCourse) => void;
}) {
  return (
    <FlatList
      horizontal
      testID="course-strip"
      data={courses}
      keyExtractor={(c) => c.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm }}
      renderItem={({ item, index }) => {
        const done = isDone(item);
        const pct = item.progress.total
          ? Math.round((item.progress.completed / item.progress.total) * 100)
          : 0;
        const selected = selectedId ? item.id === selectedId : index === 0;
        return (
          <PressableCard
            testID={`strip-${item.id}`}
            accessibilityLabel={`${item.title}, ${item.progress.completed} of ${item.progress.total} lessons done`}
            onPress={() => onSelect(item)}
            style={{
              width: 240,
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radii.card,
              backgroundColor: colors.blueTint,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? colors.blue : neutrals.divider,
              borderBottomWidth: selected ? 2 : 1,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.blue,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather
                name={done ? "check" : "book-open"}
                size={22}
                color={colors.onBlue}
                accessible={false}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text variant="caption" tone="link" style={{ fontWeight: "700", letterSpacing: 1 }}>
                COURSE {index + 1}
              </Text>
              <Text variant="bodyStrong" numberOfLines={1}>
                {item.title}
              </Text>
              <View
                accessible={false}
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: neutrals.divider,
                  overflow: "hidden",
                }}
              >
                <View style={{ width: `${pct}%`, height: 6, backgroundColor: colors.blue }} />
              </View>
            </View>
          </PressableCard>
        );
      }}
    />
  );
}
