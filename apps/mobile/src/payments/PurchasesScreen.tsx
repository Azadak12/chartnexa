import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { formatPrice } from "../courses/money";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { neutrals, radii, spacing } from "../theme";
import { Button, Screen, Text } from "../ui";
import { ORDER_STATUS_TEXT, paymentApi } from "./payment-api";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });

/** The person's purchases, newest first, with the status in words. */
export function PurchasesScreen() {
  const router = useRouter();
  const q = useInfiniteQuery({
    queryKey: ["orders", "all"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => paymentApi.listOrders(pageParam ? { cursor: pageParam } : {}),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: shouldRetry,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Purchases
      </Text>
      <Text variant="caption" tone="muted">
        Test mode: no real payments have been made.
      </Text>
      {q.status === "pending" ? (
        <StateView state="loading" />
      ) : q.status === "error" ? (
        <StateView
          state={isAppError(q.error) && q.error.kind === "network" ? "offline" : "error"}
          message={isAppError(q.error) ? q.error.message : messageFor("unknown")}
          onAction={() => void q.refetch()}
        />
      ) : items.length === 0 ? (
        <StateView
          state="empty"
          title="No purchases yet"
          message="Courses you buy will appear here."
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((o) => (
            <View
              key={o.id}
              testID={`order-${o.id}`}
              accessible
              accessibilityLabel={`${o.courseTitle}, ${formatPrice(o.amountCents)}, ${ORDER_STATUS_TEXT[o.status]}, ${date(o.createdAt)}`}
              style={{
                gap: spacing.xs,
                padding: spacing.md,
                borderRadius: radii.card,
                borderWidth: 1,
                borderColor: neutrals.divider,
              }}
            >
              <Text variant="bodyStrong">{o.courseTitle}</Text>
              <Text>
                {formatPrice(o.amountCents)} · {ORDER_STATUS_TEXT[o.status]}
              </Text>
              <Text variant="caption" tone="muted">
                {date(o.createdAt)}
              </Text>
            </View>
          ))}
          {q.hasNextPage ? (
            <Button
              label="Show more purchases"
              variant="secondary"
              loading={q.isFetchingNextPage}
              onPress={() => void q.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
      <Button
        label="Back"
        variant="tertiary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/profile"))}
      />
    </Screen>
  );
}
