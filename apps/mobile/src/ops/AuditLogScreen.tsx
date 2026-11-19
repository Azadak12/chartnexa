import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { AuditEvent } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canReadAudit, fetchAccess } from "../courses/course-api";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { neutrals, radii, spacing } from "../theme";
import { Button, Chip, Screen, Text, TextField } from "../ui";
import { actionText, opsApi, shortId } from "./ops-api";

type Outcome = "success" | "denied" | undefined;
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const json = (v: unknown) => (v == null ? "none" : JSON.stringify(v, null, 2));

/** The audit log for Admins: newest first, filter by outcome and action, details on demand. */
export function AuditLogScreen() {
  const router = useRouter();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canReadAudit(access.data);
  const [outcome, setOutcome] = useState<Outcome>(undefined);
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ["audit", outcome, action],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => opsApi.audit({ outcome, action, cursor: pageParam }),
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
            message="Only Admins can read the audit log."
            actionLabel="Back"
            onAction={back}
          />
        )}
      </Screen>
    );
  }
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = outcome !== undefined || action !== undefined;
  const row = (e: AuditEvent) => {
    const expanded = open === e.id;
    return (
      <View
        key={e.id}
        testID={`audit-${e.id}`}
        style={{
          borderWidth: 1,
          borderColor: neutrals.divider,
          borderRadius: radii.card,
          padding: spacing.md,
          gap: spacing.xs,
        }}
      >
        <Text variant="subheading">{actionText(e.action)}</Text>
        <Text variant="caption" tone={e.outcome === "denied" ? "error" : "muted"}>
          {e.outcome === "denied" ? "Denied" : "Done"} · {when(e.occurredAt)}
        </Text>
        <Text>
          {e.actorKind === "system" ? "By the system" : `By person ${shortId(e.actorUserId)}`} ·{" "}
          {e.targetType.replace(/_/g, " ")} {shortId(e.targetId)}
        </Text>
        {e.reason ? <Text tone="muted">Reason: {e.reason}</Text> : null}
        <Button
          label={expanded ? "Hide details" : "Show details"}
          variant="tertiary"
          accessibilityLabel={`${expanded ? "Hide" : "Show"} details of ${actionText(e.action)}`}
          onPress={() => setOpen(expanded ? null : e.id)}
        />
        {expanded ? (
          <View style={{ gap: spacing.xs }} testID={`audit-details-${e.id}`}>
            <Text variant="caption" tone="muted">
              Actor {e.actorUserId ?? "none"} · Target {e.targetId} · Request{" "}
              {e.requestId ?? "none"}
            </Text>
            <Text variant="caption">Before</Text>
            <Text variant="caption" selectable>
              {json(e.before)}
            </Text>
            <Text variant="caption">After</Text>
            <Text variant="caption" selectable>
              {json(e.after)}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Audit log
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {(
          [
            [undefined, "Everything"],
            ["success", "Done"],
            ["denied", "Denied"],
          ] as const
        ).map(([value, label]) => (
          <Chip
            key={label}
            label={label}
            selected={outcome === value}
            onPress={() => setOutcome(value)}
          />
        ))}
      </View>
      <TextField
        label="Action (for example review.hide)"
        value={actionInput}
        onChangeText={setActionInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => setAction(actionInput.trim() || undefined)}
      />
      <Button
        label="Filter"
        variant="secondary"
        onPress={() => setAction(actionInput.trim() || undefined)}
      />
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
          title={filtered ? "Nothing matches" : "No records yet"}
          message={filtered ? "Try another action or outcome." : "Recorded actions appear here."}
          {...(filtered
            ? {
                actionLabel: "Clear filters",
                onAction: () => {
                  setOutcome(undefined);
                  setAction(undefined);
                  setActionInput("");
                },
              }
            : {})}
        />
      ) : (
        <>
          {items.map(row)}
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
