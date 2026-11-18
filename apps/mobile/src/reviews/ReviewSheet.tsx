import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type RefObject } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { REVIEW_BODY_MAX, type Review } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { colors, MIN_TOUCH_SIZE, spacing } from "../theme";
import { BottomSheet, Banner, Button, Text, TextField, useSubmitOnce } from "../ui";
import { reviewsApi } from "./review-api";

const NO_ACCESS = "You no longer have access to this course, so you cannot change your review.";

/** Five labelled star buttons and a text box. Saving twice is safe: the server keeps one review. */
export function ReviewSheet({
  courseId,
  existing,
  visible,
  onClose,
  openerRef,
}: {
  courseId: string;
  existing: Review | null;
  visible: boolean;
  onClose: () => void;
  openerRef?: RefObject<unknown>;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [ratingError, setRatingError] = useState<string | undefined>();
  const [bodyError, setBodyError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);

  // Opening the sheet starts from the saved review (or empty); closing it keeps nothing half typed.
  useEffect(() => {
    if (visible) {
      setRating(existing?.rating ?? 0);
      setBody(existing?.body ?? "");
      setRatingError(undefined);
      setBodyError(undefined);
      setMessage(null);
    }
  }, [visible, existing]);

  const { run, pending } = useSubmitOnce(async () => {
    setMessage(null);
    setRatingError(undefined);
    setBodyError(undefined);
    if (rating < 1) {
      setRatingError("Choose a rating from 1 to 5 stars");
      return;
    }
    if (body.trim().length > REVIEW_BODY_MAX) {
      setBodyError(`Use ${REVIEW_BODY_MAX.toLocaleString("en-US")} characters or fewer`);
      return;
    }
    try {
      await reviewsApi.write(courseId, { rating, body: body.trim() });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["reviews", courseId] }),
        qc.invalidateQueries({ queryKey: ["my-review", courseId] }),
        qc.invalidateQueries({ queryKey: ["course", courseId] }),
        qc.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
      AccessibilityInfo.announceForAccessibility("Review saved");
      onClose();
    } catch (e) {
      if (isAppError(e) && e.kind === "forbidden") {
        setMessage(NO_ACCESS);
        void qc.invalidateQueries({ queryKey: ["course", courseId] });
        return;
      }
      if (isAppError(e) && e.kind === "validation" && e.fields.length > 0) {
        for (const f of e.fields) {
          if (f.field === "rating") setRatingError(f.message);
          else if (f.field === "body") setBodyError(f.message);
        }
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

  return (
    <BottomSheet
      visible={visible}
      title={existing ? "Edit your review" : "Write a review"}
      onDismiss={onClose}
      {...(openerRef ? { openerRef } : {})}
    >
      {message ? <Banner kind="error" message={message} testID="review-error" /> : null}
      <View accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
        <Text variant="bodyStrong">Your rating</Text>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n} ${n === 1 ? "star" : "stars"}`}
              accessibilityState={{ checked: rating === n, selected: rating === n }}
              onPress={() => {
                setRating(n);
                setRatingError(undefined);
              }}
              style={{
                minWidth: MIN_TOUCH_SIZE,
                minHeight: MIN_TOUCH_SIZE,
                alignItems: "center",
                justifyContent: "center",
              }}
              testID={`star-${n}`}
            >
              <Feather
                name="star"
                size={28}
                color={n <= rating ? colors.blue : colors.black}
                style={{ opacity: n <= rating ? 1 : 0.3 }}
                accessible={false}
              />
            </Pressable>
          ))}
        </View>
        <Text variant="caption" tone="muted" testID="rating-label">
          {rating === 0 ? "No rating chosen" : `${rating} ${rating === 1 ? "star" : "stars"}`}
        </Text>
        {ratingError ? (
          <Text variant="caption" tone="error" accessibilityRole="alert" testID="rating-error">
            {ratingError}
          </Text>
        ) : null}
      </View>
      <TextField
        label="Your review (optional)"
        value={body}
        onChangeText={setBody}
        error={bodyError}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        maxLength={REVIEW_BODY_MAX + 100}
      />
      <Text variant="caption" tone="muted" testID="review-count">
        {body.length} / {REVIEW_BODY_MAX.toLocaleString("en-US")}
      </Text>
      <Button label="Save review" loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
