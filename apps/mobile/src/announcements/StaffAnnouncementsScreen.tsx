import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import {
  ANNOUNCEMENT_REASON_MAX,
  ANNOUNCEMENT_REASON_MIN,
  type StaffAnnouncement,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canPublishAnnouncements, fetchAccess } from "../courses/course-api";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { neutrals, radii, spacing } from "../theme";
import { Banner, BottomSheet, Button, Screen, Text, TextField, useSubmitOnce } from "../ui";
import { staffAnnouncementApi } from "./announcement-api";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Every announcement for Admins and Managers: post, see read counts, withdraw. */
export function StaffAnnouncementsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canPublishAnnouncements(access.data);
  const q = useInfiniteQuery({
    queryKey: ["staff-announcements"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => staffAnnouncementApi.list(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: shouldRetry,
    enabled: allowed,
    staleTime: 0,
  });
  const [withdrawing, setWithdrawing] = useState<StaffAnnouncement | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
            message="Only Admins and Managers can post announcements."
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
      <Text variant="title" accessibilityRole="header">
        Post announcements
      </Text>
      {info ? <Banner kind="success" message={info} testID="staff-ann-info" /> : null}
      <Button
        label="New announcement"
        onPress={() => router.push("/profile/staff-announcements/new")}
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
        <StateView state="empty" title="Nothing posted yet" message="Announcements appear here." />
      ) : (
        <>
          {items.map((a) => (
            <View
              key={a.id}
              testID={`staff-ann-${a.id}`}
              style={{
                borderWidth: 1,
                borderColor: neutrals.divider,
                borderRadius: radii.card,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <Text variant="subheading">{a.title}</Text>
              <Text variant="caption" tone={a.status === "withdrawn" ? "error" : "muted"}>
                {a.courseTitle ?? "Everyone"} · {when(a.publishedAt)} ·{" "}
                {a.status === "withdrawn" ? "Withdrawn" : `Read by ${a.readCount}`}
              </Text>
              {a.withdrawReason ? <Text tone="muted">Reason: {a.withdrawReason}</Text> : null}
              <Text numberOfLines={3}>{a.body}</Text>
              {a.status === "published" ? (
                <Button
                  label="Withdraw"
                  variant="tertiary"
                  accessibilityLabel={`Withdraw ${a.title}`}
                  onPress={() => {
                    setInfo(null);
                    setWithdrawing(a);
                  }}
                />
              ) : null}
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
      <WithdrawSheet
        target={withdrawing}
        onClose={() => setWithdrawing(null)}
        onDone={() => {
          setWithdrawing(null);
          const text = "Withdrawn. Readers no longer see it.";
          setInfo(text);
          AccessibilityInfo.announceForAccessibility(text);
          void qc.invalidateQueries({ queryKey: ["staff-announcements"] });
          void qc.invalidateQueries({ queryKey: ["announcements"] });
        }}
      />
    </Screen>
  );
}

function WithdrawSheet({
  target,
  onClose,
  onDone,
}: {
  target: StaffAnnouncement | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const openFor = target?.id ?? null;
  useEffect(() => {
    if (openFor) {
      setReason("");
      setFieldError(undefined);
      setMessage(null);
    }
  }, [openFor]);
  const { run, pending } = useSubmitOnce(async () => {
    if (!target) return;
    const r = reason.trim();
    if (r.length < ANNOUNCEMENT_REASON_MIN || r.length > ANNOUNCEMENT_REASON_MAX) {
      setFieldError(`Write ${ANNOUNCEMENT_REASON_MIN} to ${ANNOUNCEMENT_REASON_MAX} characters`);
      return;
    }
    setFieldError(undefined);
    setMessage(null);
    try {
      await staffAnnouncementApi.withdraw(target.id, r);
      onDone();
    } catch (e) {
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });
  return (
    <BottomSheet visible={target !== null} title="Withdraw this announcement?" onDismiss={onClose}>
      {target ? (
        <Text>{target.title}. Readers will no longer see it. This cannot be undone.</Text>
      ) : null}
      {message ? <Banner kind="error" message={message} testID="withdraw-error" /> : null}
      <TextField
        label="Reason (kept in the audit log)"
        value={reason}
        onChangeText={setReason}
        error={fieldError}
        maxLength={ANNOUNCEMENT_REASON_MAX + 10}
      />
      <Button label="Withdraw" loading={pending} onPress={() => void run()} />
      <Button label="Keep it" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
