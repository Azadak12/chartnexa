import { memo } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, useWindowDimensions, View } from "react-native";
import { NO_RATING } from "@chartnexa/api-contracts";
import type { PublicCourseSummary } from "@chartnexa/api-contracts";
import { LEVEL_LABEL } from "../courses/CourseCard";
import { ratingText as ratingWords } from "../reviews/RatingSummary";
import { formatPrice } from "../courses/money";
import { colors, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";
import { CourseThumbnail } from "./CourseThumbnail";

const ratingA11y = (r: PublicCourseSummary["rating"]): string => {
  const t = ratingWords(r);
  return t === "No reviews yet" ? t : `Rated ${t}`;
};
const label = (c: PublicCourseSummary) =>
  `${c.title}, ${LEVEL_LABEL[c.level]}${c.instructor ? `, by ${c.instructor.displayName}` : ""}, ${formatPrice(c.priceCents)}, ${ratingWords(c.rating)}`;

/** One star and the average with the count: short enough to share a row on a 320dp phone. */
function Rating({ c }: { c: PublicCourseSummary }) {
  const r = c.rating ?? NO_RATING;
  const none = r.count === 0 || r.average === null;
  return (
    <View
      accessible
      accessibilityLabel={ratingA11y(c.rating)}
      testID={`rating-${c.id}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}
    >
      <Feather
        name="star"
        size={13}
        color={none ? neutrals.muted : colors.blue}
        accessible={false}
      />
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {none ? "No reviews yet" : `${(r.average ?? 0).toFixed(1)} (${r.count})`}
      </Text>
    </View>
  );
}

/** The price always has a row of its own, so no neighbour can push it off the card or overlap it. */
function PriceRow({ c }: { c: PublicCourseSummary }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="bodyStrong" style={{ flexShrink: 0 }} testID={`price-${c.id}`}>
        {formatPrice(c.priceCents)}
      </Text>
      <Feather name="chevron-right" size={18} color={neutrals.muted} accessible={false} />
    </View>
  );
}

/** Thumbnail width follows the screen so the text column keeps room on a 320dp phone. */
export function thumbWidth(screenWidth: number): number {
  return screenWidth < 360 ? 84 : screenWidth < 400 ? 96 : 108;
}

/**
 * A responsive list card. The text column is flexible (`flex: 1`, `minWidth: 0`), titles are
 * limited to two lines, the rating wraps under the level when space is short, and the price sits
 * on its own row. Nothing has a fixed width except the thumbnail, which is a fraction of the screen.
 */
export const CourseCard = memo(function CourseCard({
  course: c,
  onPress,
}: {
  course: PublicCourseSummary;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label(c)}
      onPress={onPress}
      testID={`course-${c.id}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        padding: spacing.sm,
        minHeight: 96,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: neutrals.divider,
        backgroundColor: pressed ? neutrals.surface : colors.white,
      })}
    >
      <View style={{ flexShrink: 0 }}>
        <CourseThumbnail
          tone={c.coverTone}
          thumbnailUrl={c.thumbnailUrl}
          width={thumbWidth(width)}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }} testID={`card-body-${c.id}`}>
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
            {c.instructor.displayName}
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: spacing.sm,
            rowGap: 2,
          }}
        >
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {LEVEL_LABEL[c.level]}
          </Text>
          <Rating c={c} />
        </View>
        <PriceRow c={c} />
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
        <Rating c={c} />
        <PriceRow c={c} />
      </View>
    </Pressable>
  );
});
