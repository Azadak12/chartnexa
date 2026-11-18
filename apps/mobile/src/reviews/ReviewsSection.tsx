import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { ConfirmDialog } from "../auth/ConfirmDialog";
import { useSession } from "../session/session-store";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { neutrals, radii, spacing } from "../theme";
import { Banner, Button, Skeleton, Text } from "../ui";
import { RatingSummary } from "./RatingSummary";
import { reviewsApi } from "./review-api";
import { ReviewSheet } from "./ReviewSheet";
import { HiddenNotice } from "./HiddenNotice";
import { ReportSheet } from "./ReportSheet";

const date = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/** The course page's reviews. It fails on its own: the rest of the page stays usable. */
export function ReviewsSection({
  courseId,
  enrolled,
  rating,
}: {
  courseId: string;
  enrolled: boolean;
  rating: Parameters<typeof RatingSummary>[0]["rating"];
}) {
  const qc = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["reviews", courseId, enrolled],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => reviewsApi.list(courseId, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: shouldRetry,
  });
  const mine = useQuery({
    queryKey: ["my-review", courseId],
    enabled: enrolled,
    queryFn: () => reviewsApi.mine(courseId),
    retry: shouldRetry,
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const reportRefs = useRef<Record<string, unknown>>({});
  const reportOpener = useRef<unknown>(null);
  const { status: sessionStatus } = useSession();
  const signedIn = sessionStatus === "signed-in";
  const writeRef = useRef(null);
  const deleteRef = useRef(null);
  const own = mine.data?.review ?? null;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const remove = async () => {
    try {
      await reviewsApi.remove(courseId);
    } catch (e) {
      setDeleting(false);
      if (isAppError(e) && e.kind === "forbidden") {
        setMessage("You no longer have access to this course, so you cannot change your review.");
        void qc.invalidateQueries({ queryKey: ["course", courseId] });
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
      return;
    }
    setDeleting(false);
    setMessage(null);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["reviews", courseId] }),
      qc.invalidateQueries({ queryKey: ["my-review", courseId] }),
      qc.invalidateQueries({ queryKey: ["course", courseId] }),
      qc.invalidateQueries({ queryKey: ["catalog"] }),
    ]);
    AccessibilityInfo.announceForAccessibility("Review deleted");
  };

  return (
    <View style={{ gap: spacing.md }} testID="reviews-section">
      <Text variant="heading" accessibilityRole="header">
        Reviews
      </Text>
      <RatingSummary rating={rating} testID="reviews-summary" />
      {message ? <Banner kind="error" message={message} testID="reviews-error" /> : null}
      {enrolled && mine.status === "success" && mine.data?.moderation ? (
        <HiddenNotice courseId={courseId} moderation={mine.data.moderation} />
      ) : null}
      {enrolled && mine.status === "success" ? (
        <View style={{ gap: spacing.sm }}>
          <View ref={writeRef} collapsable={false}>
            <Button
              label={own ? "Edit your review" : "Write a review"}
              variant="secondary"
              onPress={() => setEditing(true)}
            />
          </View>
          {own ? (
            <View ref={deleteRef} collapsable={false}>
              <Button
                label="Delete your review"
                variant="tertiary"
                onPress={() => setDeleting(true)}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {list.status === "pending" ? (
        <View style={{ gap: spacing.sm }} accessibilityLabel="Loading reviews">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : list.status === "error" ? (
        <StateView
          state={isAppError(list.error) && list.error.kind === "network" ? "offline" : "error"}
          message={isAppError(list.error) ? list.error.message : messageFor("unknown")}
          requestId={isAppError(list.error) ? list.error.requestId : null}
          onAction={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <Text tone="muted" testID="reviews-empty">
          No reviews yet
        </Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((r) => (
            <View
              key={r.id}
              testID={`review-${r.id}`}
              style={{
                gap: spacing.xs,
                padding: spacing.md,
                borderRadius: radii.card,
                borderWidth: 1,
                borderColor: neutrals.divider,
              }}
            >
              <View
                accessible
                accessibilityLabel={`${r.rating} ${r.rating === 1 ? "star" : "stars"}, ${r.reviewerName}${r.mine ? ", your review" : ""}, ${date(r.createdAt)}. ${r.body}`}
                style={{ gap: spacing.xs }}
              >
                <Text variant="bodyStrong">
                  {r.rating} {r.rating === 1 ? "star" : "stars"} · {r.reviewerName}
                  {r.mine ? " (you)" : ""}
                </Text>
                <Text variant="caption" tone="muted">
                  {date(r.createdAt)}
                </Text>
                {r.body ? <Text>{r.body}</Text> : null}
              </View>
              {signedIn && !r.mine ? (
                <View
                  ref={(node) => {
                    reportRefs.current[r.id] = node;
                  }}
                  collapsable={false}
                >
                  <Button
                    label={`Report review by ${r.reviewerName}`}
                    variant="tertiary"
                    onPress={() => {
                      reportOpener.current = reportRefs.current[r.id];
                      setReporting(r.id);
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))}
          {list.hasNextPage ? (
            <Button
              label="Show more reviews"
              variant="secondary"
              loading={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
      <ReportSheet
        courseId={courseId}
        reviewId={reporting ?? ""}
        visible={reporting !== null}
        onClose={() => setReporting(null)}
        openerRef={reportOpener}
      />
      <ReviewSheet
        courseId={courseId}
        existing={own}
        visible={editing}
        onClose={() => setEditing(false)}
        openerRef={writeRef}
      />
      <ConfirmDialog
        visible={deleting}
        title="Delete your review?"
        message="Your review will be removed and the course's rating will be updated. You can write a new one later."
        confirmLabel="Delete review"
        openerRef={deleteRef}
        onCancel={() => setDeleting(false)}
        onConfirm={remove}
      />
    </View>
  );
}
