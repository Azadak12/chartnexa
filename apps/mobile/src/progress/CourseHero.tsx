import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { View } from "react-native";
import type { MyCourse } from "@chartnexa/api-contracts";
import { colors, neutrals, radii, spacing } from "../theme";
import { Button, Text } from "../ui";
import { LearningJourney } from "./LearningJourney";

/**
 * The selected course as a large card: title, summary and "n/m lessons". No mastery score or rank
 * is shown, because the backend stores none. The lesson path (unit cards and lessons) opens below.
 */
export function CourseHero({
  course,
  onOpen,
  alwaysPath = false,
}: {
  course: MyCourse;
  onOpen: () => void;
  /** Show the lesson path straight away, with no Show/Hide button (the Home layout). */
  alwaysPath?: boolean;
}) {
  const [toggled, setShowPath] = useState(false);
  const showPath = alwaysPath || toggled;
  const { completed, total } = course.progress;
  return (
    <View style={{ gap: spacing.md }} testID="course-hero">
      <View
        style={{
          gap: spacing.sm,
          padding: spacing.lg,
          borderRadius: radii.card,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: neutrals.divider,
        }}
      >
        <Text variant="caption" tone="link" style={{ fontWeight: "700", letterSpacing: 1.5 }}>
          YOUR COURSE
        </Text>
        <Text variant="title" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 40 }}>
          {course.title}
        </Text>
        <Text tone="muted">{course.summary}</Text>
        <View
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: neutrals.divider,
            backgroundColor: neutrals.surface,
          }}
        >
          <Feather name="book-open" size={14} color={colors.ink} accessible={false} />
          <Text variant="caption" testID="course-hero-count">
            {completed}/{total} lessons
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Open course" onPress={onOpen} />
          </View>
          {alwaysPath ? null : (
            <View style={{ flex: 1 }}>
              <Button
                label={showPath ? "Hide lessons" : "Show lessons"}
                variant="secondary"
                onPress={() => setShowPath(!showPath)}
              />
            </View>
          )}
        </View>
      </View>
      {showPath ? <LearningJourney key={course.id} courseId={course.id} /> : null}
    </View>
  );
}
