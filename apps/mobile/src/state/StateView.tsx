import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { colors, spacing } from "../theme";
import { Button, Skeleton, Text } from "../ui";

export type ViewState = "loading" | "empty" | "error" | "offline" | "unauthorized";

export interface StateViewProps {
  state: ViewState;
  title?: string;
  message?: string;
  /** Primary action: Retry for errors, Sign in for unauthorized, or a next step for empty. */
  actionLabel?: string;
  onAction?: () => void;
  /** Support reference shown in small print under errors. */
  requestId?: string | null;
}

const defaults: Record<
  Exclude<ViewState, "loading">,
  {
    icon: React.ComponentProps<typeof Feather>["name"];
    title: string;
    message: string;
    action?: string;
  }
> = {
  empty: {
    icon: "inbox",
    title: "Nothing here yet",
    message: "When there is something to show, it will appear here.",
  },
  error: {
    icon: "alert-circle",
    title: "Something went wrong",
    message: "Please try again.",
    action: "Retry",
  },
  offline: {
    icon: "wifi-off",
    title: "You are offline",
    message: "Check your connection and try again.",
    action: "Retry",
  },
  unauthorized: {
    icon: "lock",
    title: "Session ended",
    message: "Please sign in again to continue.",
    action: "Sign in",
  },
};

/** One presentation for every way a data screen can be without content. */
export function StateView({
  state,
  title,
  message,
  actionLabel,
  onAction,
  requestId,
}: StateViewProps) {
  if (state === "loading") {
    return (
      <View
        style={styles.loading}
        testID="state-loading"
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
      >
        <Skeleton height={20} width="60%" />
        <Skeleton height={14} />
        <Skeleton height={14} width="80%" />
        <Skeleton height={14} width="70%" />
      </View>
    );
  }
  const d = defaults[state];
  const label = actionLabel ?? d.action;
  return (
    <View style={styles.center} testID={`state-${state}`}>
      <Feather
        name={d.icon}
        size={32}
        color={state === "error" ? colors.black : colors.blue}
        accessible={false}
      />
      <Text variant="heading" accessibilityRole="header" style={styles.centerText}>
        {title ?? d.title}
      </Text>
      <Text tone="muted" style={styles.centerText}>
        {message ?? d.message}
      </Text>
      {label && onAction ? <Button label={label} onPress={onAction} /> : null}
      {requestId ? (
        <Text variant="caption" tone="muted" testID="support-reference">
          Support reference: {requestId}
        </Text>
      ) : null}
    </View>
  );
}

interface QueryLike<T> {
  status: "pending" | "error" | "success";
  data: T | undefined;
  error: unknown;
  refetch: () => unknown;
  isFetching?: boolean;
}

export interface QueryStateViewProps<T> {
  query: QueryLike<T>;
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onSignIn?: () => void;
  children: (data: T) => ReactNode;
}

/** Adapts a TanStack Query result to exactly one of loading, empty, error, unauthorized or content. */
export function QueryStateView<T>({
  query,
  isEmpty,
  emptyTitle,
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
  onSignIn,
  children,
}: QueryStateViewProps<T>) {
  if (query.status === "pending") return <StateView state="loading" />;
  if (query.status === "error") {
    const e = query.error;
    if (isAppError(e) && e.kind === "unauthorized") {
      return (
        <StateView
          state="unauthorized"
          {...(onSignIn ? { onAction: onSignIn } : {})}
          requestId={e.requestId}
        />
      );
    }
    if (isAppError(e) && e.kind === "network") {
      return (
        <StateView
          state="offline"
          message={messageFor("network")}
          onAction={() => void query.refetch()}
          requestId={e.requestId}
        />
      );
    }
    const message = isAppError(e) ? e.message : messageFor("unknown");
    return (
      <StateView
        state="error"
        message={message}
        onAction={() => void query.refetch()}
        requestId={isAppError(e) ? e.requestId : null}
      />
    );
  }
  const data = query.data as T;
  if (isEmpty?.(data)) {
    return (
      <StateView
        state="empty"
        {...(emptyTitle ? { title: emptyTitle } : {})}
        {...(emptyMessage ? { message: emptyMessage } : {})}
        {...(emptyActionLabel && onEmptyAction
          ? { actionLabel: emptyActionLabel, onAction: onEmptyAction }
          : {})}
      />
    );
  }
  return <>{children(data)}</>;
}

const styles = StyleSheet.create({
  loading: { gap: spacing.md, padding: spacing.lg },
  center: { alignItems: "center", gap: spacing.md, padding: spacing.xl },
  centerText: { textAlign: "center" },
});
