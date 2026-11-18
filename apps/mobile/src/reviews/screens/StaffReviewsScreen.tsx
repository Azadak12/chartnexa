import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { isAppError, messageFor } from "../../api/errors";
import { canModerateReviews, fetchAccess } from "../../courses/course-api";
import { shouldRetry } from "../../state/query-client";
import { StateView } from "../../state/StateView";
import { neutrals, radii, spacing } from "../../theme";
import { Chip, Screen, Text } from "../../ui";
import { REASON_LABEL } from "../moderation-labels";
import { moderationApi, type QueueTab } from "../moderation-api";

const TABS: { id: QueueTab; label: string; empty: string }[] = [
  { id: "reported", label: "Reported", empty: "No reported reviews waiting." },
  { id: "hidden", label: "Hidden", empty: "No hidden reviews." },
  { id: "appeals", label: "Appeals", empty: "No appeals waiting." },
];

/** Moderators' queue. The list and every action are checked by the server, not by this screen. */
export function StaffReviewsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<QueueTab>("reported");
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canModerateReviews(access.data);
  const query = useInfiniteQuery({
    queryKey: ["staff-reviews", tab],
    enabled: allowed,
    retry: shouldRetry,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => moderationApi.queue(tab, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error") {
    return (
      <Screen>
        <StateView
          state="error"
          message={isAppError(access.error) ? access.error.message : messageFor("unknown")}
          onAction={() => void access.refetch()}
        />
      </Screen>
    );
  }
  if (!allowed) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="Only moderators can review reported reviews."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
        />
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Review moderation
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {TABS.map((t) => (
          <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />
        ))}
      </View>
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (query.status === "pending") empty = <StateView state="loading" />;
  else if (query.status === "error") {
    empty = (
      <StateView
        state={isAppError(query.error) && query.error.kind === "network" ? "offline" : "error"}
        message={isAppError(query.error) ? query.error.message : messageFor("unknown")}
        requestId={isAppError(query.error) ? query.error.requestId : null}
        onAction={() => void query.refetch()}
      />
    );
  } else if (items.length === 0) {
    empty = (
      <StateView
        state="empty"
        title="Nothing here"
        message={TABS.find((t) => t.id === tab)!.empty}
      />
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        testID="staff-review-list"
        data={items}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        renderItem={({ item }) => {
          const status = item.hidden
            ? `Hidden${item.hiddenReason ? `: ${REASON_LABEL[item.hiddenReason]}` : ""}`
            : `${item.openReportCount} open ${item.openReportCount === 1 ? "report" : "reports"}`;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.rating} ${item.rating === 1 ? "star" : "stars"} review by ${item.reviewerName} on ${item.courseTitle}. ${status}${item.openAppeal ? ". Appeal waiting" : ""}`}
              onPress={() => router.push(`/profile/reviews/${item.id}`)}
              testID={`staff-review-${item.id}`}
              style={{
                gap: spacing.xs,
                padding: spacing.md,
                minHeight: 44,
                borderRadius: radii.card,
                borderWidth: 1,
                borderColor: neutrals.divider,
              }}
            >
              <Text variant="bodyStrong">{item.courseTitle}</Text>
              <Text variant="caption" tone="muted">
                {item.rating} {item.rating === 1 ? "star" : "stars"} · {item.reviewerName}
              </Text>
              <Text numberOfLines={2}>{item.body || "No text"}</Text>
              <Text variant="bodyStrong">{status}</Text>
              {item.openAppeal ? <Text variant="bodyStrong">Appeal waiting</Text> : null}
            </Pressable>
          );
        }}
        ListFooterComponent={query.isFetchingNextPage ? <StateView state="loading" /> : undefined}
      />
    </Screen>
  );
}
