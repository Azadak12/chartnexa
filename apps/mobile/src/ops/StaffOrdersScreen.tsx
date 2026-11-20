import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ORDER_STATUSES, type OrderStatus } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canReadPayments, fetchAccess } from "../courses/course-api";
import { formatPrice } from "../courses/money";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { raised, spacing } from "../theme";
import { Button, Chip, Screen, Text } from "../ui";
import { opsApi, shortId } from "./ops-api";
import { StaffPageHeader } from "../kit/StaffPageHeader";

/** Staff wording: what happened and, where it matters, what still needs doing. */
export const STAFF_ORDER_TEXT: Record<OrderStatus, string> = {
  pending: "Not finished",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  reversed: "Reversed, access removed",
  duplicate_needs_refund: "Paid twice, needs a refund decision",
};
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Every order's status for Admins and Managers, newest first, filterable by status. */
export function StaffOrdersScreen() {
  const router = useRouter();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canReadPayments(access.data);
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const q = useInfiniteQuery({
    queryKey: ["staff-orders", status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => opsApi.orders({ status, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: shouldRetry,
    enabled: allowed,
    // Operators expect what is true now, not a list cached a moment ago.
    staleTime: 0,
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/profile"));

  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error" || !allowed) {
    return (
      <Screen>
        {access.status === "error" ? (
          <StateView
            state="error"
            message={isAppError(access.error) ? access.error.message : messageFor("unknown")}
            onAction={() => void access.refetch()}
          />
        ) : (
          <StateView
            state="empty"
            title="You do not have access"
            message="Only Admins and Managers can see orders."
            actionLabel="Back"
            onAction={back}
          />
        )}
      </Screen>
    );
  }
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Screen>
      <StaffPageHeader title="Orders" eyebrow="COMMAND CENTER" icon="shield" />
      <Text variant="caption" tone="muted">
        Test mode: no real payments have been made. Card details are never stored here.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip label="All" selected={status === undefined} onPress={() => setStatus(undefined)} />
        {ORDER_STATUSES.map((s) => (
          <Chip
            key={s}
            label={STAFF_ORDER_TEXT[s]}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>
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
          title={status ? "No orders with this status" : "No orders yet"}
          message={status ? "Choose another status." : "Orders appear here once people buy."}
        />
      ) : (
        <>
          {items.map((o) => (
            <View
              key={o.id}
              testID={`order-${o.id}`}
              style={{
                ...raised,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text variant="subheading">{o.courseTitle}</Text>
              <Text>
                {formatPrice(o.amountCents)} · {STAFF_ORDER_TEXT[o.status]}
              </Text>
              <Text variant="caption" tone="muted">
                {when(o.createdAt)} · Buyer {shortId(o.userId)} · Order {shortId(o.id)} ·{" "}
                {o.testMode ? "Test" : o.provider}
              </Text>
            </View>
          ))}
          {q.hasNextPage ? (
            <Button
              label="Load more"
              variant="secondary"
              loading={q.isFetchingNextPage}
              onPress={() => void q.fetchNextPage()}
            />
          ) : null}
        </>
      )}
      <Button label="Back" variant="tertiary" onPress={back} />
    </Screen>
  );
}
