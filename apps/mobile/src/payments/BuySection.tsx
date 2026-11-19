import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { formatPrice } from "../courses/money";
import { shouldRetry } from "../state/query-client";
import { spacing } from "../theme";
import { Banner, Button, Text, useSubmitOnce } from "../ui";
import { newPurchaseKey, paymentApi } from "./payment-api";

/**
 * Buy a course (test mode: no money is charged). An unfinished checkout is offered again, so
 * closing the app mid-purchase loses nothing.
 */
export function BuySection({ courseId, priceCents }: { courseId: string; priceCents: number }) {
  const router = useRouter();
  const key = useRef(newPurchaseKey());
  const [message, setMessage] = useState<string | null>(null);
  const orders = useQuery({
    queryKey: ["orders", courseId],
    queryFn: () => paymentApi.listOrders({ courseId }),
    retry: shouldRetry,
  });
  const pending = orders.data?.items.find((o) => o.status === "pending") ?? null;
  const { run, pending: busy } = useSubmitOnce(async () => {
    setMessage(null);
    try {
      const order = await paymentApi.createOrder(courseId, key.current);
      router.push(`/checkout/${order.id}`);
    } catch (e) {
      setMessage(
        isAppError(e) && e.code === "ALREADY_OWNED"
          ? "You already have this course. Pull to refresh."
          : isAppError(e)
            ? e.message
            : messageFor("unknown"),
      );
    }
  });

  if (priceCents <= 0) {
    return (
      <Banner
        kind="info"
        message="This course is free. Ask the academy for access."
        testID="enroll-notice"
      />
    );
  }
  return (
    <View style={{ gap: spacing.sm }} testID="enroll-notice" accessibilityLabel="Buy this course">
      {message ? <Banner kind="error" message={message} testID="buy-error" /> : null}
      {pending ? (
        <Button
          label="Finish your purchase"
          onPress={() => router.push(`/checkout/${pending.id}`)}
        />
      ) : (
        <Button
          label={`Buy for ${formatPrice(priceCents)}`}
          loading={busy}
          onPress={() => void run()}
        />
      )}
      <Text variant="caption" tone="muted" testID="test-mode-note">
        Test mode: no money is charged.
      </Text>
    </View>
  );
}
