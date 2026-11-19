import { Feather } from "@expo/vector-icons";
import { memo } from "react";
import { View, useWindowDimensions } from "react-native";
import type { StaffCourse } from "@chartnexa/api-contracts";
import { LEVEL_LABEL } from "../courses/CourseCard";
import { formatPrice } from "../courses/money";
import { accents, colors, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";
import { CourseThumbnail } from "./CourseThumbnail";
import { thumbWidth } from "./CourseCards";
import { PressableCard } from "./PressableCard";

/** Published is emerald with a check, Draft is amber with a pencil: the word is always there too. */
export function StatusPill({ status, id }: { status: StaffCourse["status"]; id: string }) {
  const published = status === "published";
  const a = published ? accents.emerald : accents.amber;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radii.pill,
        backgroundColor: a.tint,
      }}
    >
      <Feather
        name={published ? "check-circle" : "edit-3"}
        size={12}
        color={a.ink}
        accessible={false}
      />
      <Text variant="caption" style={{ color: a.ink, fontWeight: "700" }} testID={`status-${id}`}>
        {published ? "Published" : "Draft"}
      </Text>
    </View>
  );
}

/**
 * A course in the instructor's list: thumbnail, status, title (wraps up to three lines), level and
 * price. The price has a row of its own and never shrinks, so it cannot clip or collide with the
 * title. Only fields the course already has are shown.
 */
export const CourseManageCard = memo(function CourseManageCard({
  course: c,
  onPress,
  testID,
}: {
  course: StaffCourse;
  onPress: () => void;
  testID?: string;
}) {
  const { width } = useWindowDimensions();
  return (
    <PressableCard
      testID={testID ?? `staff-course-${c.id}`}
      accessibilityLabel={`${c.title}, ${c.status === "draft" ? "Draft" : "Published"}, ${LEVEL_LABEL[c.level]}, ${formatPrice(c.priceCents)}`}
      accessibilityHint="Opens the course to edit"
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        padding: spacing.sm,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: neutrals.divider,
        backgroundColor: colors.white,
        shadowColor: colors.black,
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      }}
      pressedStyle={{ backgroundColor: neutrals.surface, elevation: 0, shadowOpacity: 0.02 }}
    >
      <View style={{ flexShrink: 0 }}>
        <CourseThumbnail
          tone={c.coverTone}
          thumbnailUrl={c.thumbnailUrl}
          width={thumbWidth(width)}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <StatusPill status={c.status} id={c.id} />
        <Text variant="bodyStrong" numberOfLines={3}>
          {c.title}
        </Text>
        <Text variant="caption" tone="muted">
          {LEVEL_LABEL[c.level]}
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text variant="bodyStrong" style={{ flexShrink: 0 }} testID={`price-${c.id}`}>
            {formatPrice(c.priceCents)}
          </Text>
          <Feather name="chevron-right" size={18} color={neutrals.muted} accessible={false} />
        </View>
      </View>
    </PressableCard>
  );
});
