import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import type { Order } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { formatPrice } from "../courses/money";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { spacing } from "../theme";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../ui";
import { newPurchaseKey, ORDER_STATUS_TEXT, paymentApi } from "./payment-api";

/**
 * The test checkout, full screen. The buyer chooses what the simulated payment does; the server
 * applies it through the same path a real payment provider will use. No money moves.
 */
export function CheckoutScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => paymentApi.getOrder(String(orderId)),
    retry: shouldRetry,
  });

  const settle = async (o: Order) => {
    qc.setQueryData(["order", orderId], o);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["orders"] }),
      qc.invalidateQueries({ queryKey: ["course", o.courseId] }),
      qc.invalidateQueries({ queryKey: ["my-courses"] }),
    ]);
    AccessibilityInfo.announceForAccessibility(
      o.status === "paid"
        ? "Payment complete. You now have this course."
        : ORDER_STATUS_TEXT[o.status],
    );
  };
  const { run, pending } = useSubmitOnce(async (outcome: "paid" | "failed" | "cancelled") => {
    if (!q.data) return;
    setMessage(null);
    try {
      await settle(await paymentApi.completeTestCheckout(q.data.checkoutRef, outcome));
    } catch (e) {
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });
  const retry = useSubmitOnce(async () => {
    if (!q.data) return;
    setMessage(null);
    try {
      const fresh = await paymentApi.createOrder(q.data.courseId, newPurchaseKey());
      router.replace(`/checkout/${fresh.id}`);
    } catch (e) {
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

  if (q.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (q.status === "error") {
    return (
      <Screen>
        <StateView
          state={isAppError(q.error) && q.error.kind === "network" ? "offline" : "error"}
          message={
            isAppError(q.error) && q.error.kind === "not_found"
              ? "This purchase was not found."
              : messageFor("unknown")
          }
          onAction={() => void q.refetch()}
        />
      </Screen>
    );
  }
  const o = q.data;
  const toCourse = () => router.replace(`/course/${o.courseId}`);
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Checkout
      </Text>
      <Banner
        kind="info"
        message="Test checkout. No real payment is made and no card is needed."
        testID="test-checkout"
      />
      <View style={{ gap: spacing.xs }}>
        <Text variant="subheading">{o.courseTitle}</Text>
        <Text variant="heading">{formatPrice(o.amountCents)}</Text>
        <Text tone="muted" testID="order-status">
          Status: {ORDER_STATUS_TEXT[o.status]}
        </Text>
      </View>
      {message ? <Banner kind="error" message={message} testID="checkout-error" /> : null}
      {o.status === "pending" ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={`Pay ${formatPrice(o.amountCents)} (test)`}
            loading={pending}
            onPress={() => void run("paid")}
          />
          <Button
            label="Simulate a failed payment"
            variant="secondary"
            onPress={() => void run("failed")}
          />
          <Button
            label="Cancel purchase"
            variant="tertiary"
            onPress={() => void run("cancelled")}
          />
        </View>
      ) : o.status === "paid" ? (
        <View style={{ gap: spacing.sm }}>
          <Banner
            kind="success"
            message="Payment complete. You now have this course."
            testID="paid-notice"
          />
          <Button label="Go to the course" onPress={toCourse} />
        </View>
      ) : o.status === "failed" || o.status === "cancelled" ? (
        <View style={{ gap: spacing.sm }}>
          <Button label="Try again" loading={retry.pending} onPress={() => void retry.run()} />
          <Button label="Back to the course" variant="secondary" onPress={toCourse} />
        </View>
      ) : (
        <Button label="Back to the course" variant="secondary" onPress={toCourse} />
      )}
    </Screen>
  );
}
