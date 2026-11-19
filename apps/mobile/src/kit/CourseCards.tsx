import { memo } from "react";
import { Pressable, View } from "react-native";
import type { PublicCourseSummary } from "@chartnexa/api-contracts";
import { LEVEL_LABEL } from "../courses/CourseCard";
import { RatingSummary, ratingText as ratingWords } from "../reviews/RatingSummary";
import { formatPrice } from "../courses/money";
import { colors, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";
import { CourseThumbnail } from "./CourseThumbnail";

const label = (c: PublicCourseSummary) =>
  `${c.title}, ${LEVEL_LABEL[c.level]}${c.instructor ? `, by ${c.instructor.displayName}` : ""}, ${formatPrice(c.priceCents)}, ${ratingWords(c.rating)}`;

function Meta({ c }: { c: PublicCourseSummary }) {
  return <RatingSummary rating={c.rating} testID={`rating-${c.id}`} />;
}

/** A compact list card: small thumbnail, title, instructor, level, rating and price. */
export const CourseCard = memo(function CourseCard({
  course: c,
  onPress,
}: {
  course: PublicCourseSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label(c)}
      onPress={onPress}
      testID={`course-${c.id}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.sm,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: neutrals.divider,
        backgroundColor: pressed ? neutrals.surface : colors.white,
      })}
    >
      <CourseThumbnail tone={c.coverTone} thumbnailUrl={c.thumbnailUrl} width={112} />
      <View style={{ flex: 1, gap: 2, justifyContent: "center" }}>
        {c.categoryName ? (
          <Text variant="caption" tone="link" numberOfLines={1}>
            {c.categoryName}
          </Text>
        ) : null}
        <Text variant="bodyStrong" numberOfLines={2}>
          {c.title}
        </Text>
        {c.instructor ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {c.instructor.displayName} · {LEVEL_LABEL[c.level]}
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            {LEVEL_LABEL[c.level]}
          </Text>
        )}
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <Meta c={c} />
          <Text variant="bodyStrong">{formatPrice(c.priceCents)}</Text>
        </View>
      </View>
    </Pressable>
  );
});

/** The larger card for horizontal "featured" rows. */
export const FeaturedCourseCard = memo(function FeaturedCourseCard({
  course: c,
  onPress,
  width = 248,
}: {
  course: PublicCourseSummary;
  onPress: () => void;
  width?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label(c)}
      onPress={onPress}
      testID={`featured-${c.id}`}
      style={({ pressed }) => ({
        width,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: neutrals.divider,
        backgroundColor: pressed ? neutrals.surface : colors.white,
        overflow: "hidden",
      })}
    >
      <CourseThumbnail
        tone={c.coverTone}
        thumbnailUrl={c.thumbnailUrl}
        width={width - 2}
        rounded={0}
      />
      <View style={{ padding: spacing.md, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {c.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {c.instructor ? `${c.instructor.displayName} · ` : ""}
          {LEVEL_LABEL[c.level]}
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: spacing.xs,
          }}
        >
          <Meta c={c} />
          <Text variant="bodyStrong">{formatPrice(c.priceCents)}</Text>
        </View>
      </View>
    </Pressable>
  );
});
