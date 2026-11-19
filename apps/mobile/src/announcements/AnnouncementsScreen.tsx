import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { Announcement } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, spacing } from "../theme";
import { Button, Screen, Text } from "../ui";
import { announcementApi } from "./announcement-api";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Announcements for the person, newest first. Opening one marks it read. Plain text only. */
export function AnnouncementsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["announcements"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => announcementApi.list(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: shouldRetry,
    staleTime: 0,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [readNow, setReadNow] = useState<Set<string>>(new Set());

  const toggle = (a: Announcement) => {
    const opening = open !== a.id;
    setOpen(opening ? a.id : null);
    if (opening && !a.read && !readNow.has(a.id)) {
      setReadNow(new Set(readNow).add(a.id));
      // Marking read is a convenience: a failure leaves it unread and changes nothing else.
      announcementApi
        .markRead(a.id)
        .then(() => qc.invalidateQueries({ queryKey: ["announcements-unread"] }))
        .catch(() => undefined);
    }
  };
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Announcements
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
          title="No announcements"
          message="News from the academy and your courses appears here."
        />
      ) : (
        <>
          {items.map((a) => {
            const unread = !a.read && !readNow.has(a.id);
            const expanded = open === a.id;
            return (
              <View
                key={a.id}
                testID={`announcement-${a.id}`}
                style={{
                  borderWidth: 1,
                  borderColor: unread ? colors.blue : neutrals.divider,
                  borderRadius: radii.card,
                  padding: spacing.md,
                  gap: spacing.xs,
                }}
              >
                {unread ? (
                  <Text variant="caption" tone="link">
                    New
                  </Text>
                ) : null}
                <Text variant="subheading">{a.title}</Text>
                <Text variant="caption" tone="muted">
                  {a.courseTitle ? `${a.courseTitle} · ` : "Academy · "}
                  {when(a.publishedAt)}
                </Text>
                {expanded ? <Text selectable>{a.body}</Text> : null}
                <Button
                  label={expanded ? "Close" : "Read"}
                  variant="tertiary"
                  accessibilityLabel={`${expanded ? "Close" : "Read"} ${a.title}${unread ? ", new" : ""}`}
                  onPress={() => toggle(a)}
                />
              </View>
            );
          })}
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
      <Button
        label="Back"
        variant="tertiary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
      />
    </Screen>
  );
}
