import { Pressable, StyleSheet, View } from "react-native";
import type { PublicCourseSummary } from "@chartnexa/api-contracts";
import { colors, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";
import { CoverBlock } from "./CoverBlock";
import { formatPrice } from "./money";

export const LEVEL_LABEL = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
} as const;

export function CourseCard({
  course,
  onPress,
}: {
  course: PublicCourseSummary;
  onPress: () => void;
}) {
  const price = formatPrice(course.priceCents);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${course.title}, ${LEVEL_LABEL[course.level]}, ${price}`}
      onPress={onPress}
      style={styles.card}
      testID={`course-${course.id}`}
    >
      <CoverBlock tone={course.coverTone} />
      <View style={styles.body}>
        <Text variant="subheading">{course.title}</Text>
        {course.summary ? (
          <Text tone="muted" numberOfLines={3}>
            {course.summary}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Text variant="caption" tone="muted">
            {LEVEL_LABEL[course.level]}
          </Text>
          <Text variant="bodyStrong">{price}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  body: { gap: spacing.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
});
