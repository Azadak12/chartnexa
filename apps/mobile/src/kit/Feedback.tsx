import { View } from "react-native";
import { spacing } from "../theme";
import { StateView } from "../state/StateView";
import { Button, Skeleton } from "../ui";
import type { ButtonProps } from "../ui";

/** Plain-named aliases so screens read the same everywhere. */
export const PrimaryButton = (p: Omit<ButtonProps, "variant">) => (
  <Button {...p} variant="primary" />
);
export const SecondaryButton = (p: Omit<ButtonProps, "variant">) => (
  <Button {...p} variant="secondary" />
);

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <StateView
      state="empty"
      title={title}
      message={message}
      {...(actionLabel && onAction ? { actionLabel, onAction } : {})}
    />
  );
}
export function ErrorState({
  message,
  offline = false,
  requestId = null,
  onRetry,
}: {
  message: string;
  offline?: boolean;
  requestId?: string | null;
  onRetry: () => void;
}) {
  return (
    <StateView
      state={offline ? "offline" : "error"}
      message={message}
      requestId={requestId}
      onAction={onRetry}
    />
  );
}

/** Placeholder shapes while data loads: same size as the real content, so nothing jumps. */
export function LoadingSkeleton({
  rows = 3,
  variant = "card",
}: {
  rows?: number;
  variant?: "card" | "row";
}) {
  return (
    <View
      style={{ gap: spacing.md }}
      testID="loading-skeleton"
      accessibilityLabel="Loading"
      accessibilityLiveRegion="polite"
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.md }}>
          <Skeleton width={variant === "card" ? 112 : 48} height={variant === "card" ? 63 : 48} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width="80%" height={14} />
            <Skeleton width="55%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}
