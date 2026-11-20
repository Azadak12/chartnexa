import { Feather } from "@expo/vector-icons";
import { memo } from "react";
import { View, useWindowDimensions } from "react-native";
import type { StaffCourse } from "@chartnexa/api-contracts";
import { LEVEL_LABEL } from "../courses/CourseCard";
import { formatPrice } from "../courses/money";
import { accents, colors, neutrals, radii, raised, spacing } from "../theme";
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
export interface CardAction {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  testID?: string;
}

/**
 * A course in the instructor's list: thumbnail, status, title (wraps up to three lines), level and
 * price. The price has a row of its own and never shrinks, so it cannot clip or collide with the
 * title. Only fields the course already has are shown. Below the card body there can be one or two
 * shortcuts (for example "Lessons, videos and files") that go straight to that part of the course.
 */
export const CourseManageCard = memo(function CourseManageCard({
  course: c,
  onPress,
  testID,
  actions = [],
}: {
  course: StaffCourse;
  onPress: () => void;
  testID?: string;
  actions?: CardAction[];
}) {
  const { width } = useWindowDimensions();
  return (
    <View
      style={{
        ...raised,
        overflow: "hidden",
      }}
    >
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
          backgroundColor: colors.surface,
        }}
        pressedStyle={{ backgroundColor: neutrals.surface }}
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
      {actions.length > 0 ? (
        <View
          testID={`actions-${c.id}`}
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            padding: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: neutrals.divider,
            backgroundColor: accents.blue.tint,
          }}
        >
          {actions.map((a) => (
            <View key={a.label} style={{ flex: 1, minWidth: 0 }}>
              <PressableCard
                testID={a.testID ?? `action-${a.label}-${c.id}`}
                accessibilityLabel={`${a.label}, ${c.title}`}
                onPress={a.onPress}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: spacing.xs,
                  minHeight: 44,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radii.control,
                  backgroundColor: colors.surface,
                }}
              >
                <Feather name={a.icon} size={16} color={accents.blue.ink} accessible={false} />
                <Text
                  variant="caption"
                  style={{
                    color: accents.blue.ink,
                    fontWeight: "700",
                    flexShrink: 1,
                    textAlign: "center",
                  }}
                >
                  {a.label}
                </Text>
              </PressableCard>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});
