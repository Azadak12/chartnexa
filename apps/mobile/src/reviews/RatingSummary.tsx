import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { NO_RATING, type CourseRating } from "@chartnexa/api-contracts";
import { colors, spacing } from "../theme";
import { Text } from "../ui";

/** "4.5 · 12 reviews", "1 review" or "No reviews yet": the words carry the meaning, stars only decorate. */
export function ratingText(rating: CourseRating | undefined): string {
  const r = rating ?? NO_RATING;
  if (r.count === 0 || r.average === null) return "No reviews yet";
  return `${r.average.toFixed(1)} · ${r.count} ${r.count === 1 ? "review" : "reviews"}`;
}

export function RatingSummary({
  rating,
  testID,
}: {
  rating: CourseRating | undefined;
  testID?: string;
}) {
  const r = rating ?? NO_RATING;
  const text = ratingText(r);
  const filled = r.average === null ? 0 : Math.round(r.average);
  return (
    <View
      accessible
      accessibilityLabel={text === "No reviews yet" ? text : `Rated ${text}`}
      testID={testID}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
    >
      <View style={{ flexDirection: "row" }} importantForAccessibility="no-hide-descendants">
        {[1, 2, 3, 4, 5].map((n) => (
          <Feather
            key={n}
            name="star"
            size={14}
            color={n <= filled ? colors.blue : colors.ink}
            style={{ opacity: n <= filled ? 1 : 0.25 }}
            accessible={false}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {text}
      </Text>
    </View>
  );
}
