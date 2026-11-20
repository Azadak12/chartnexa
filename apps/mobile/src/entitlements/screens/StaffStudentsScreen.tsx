import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import type { CourseStudent } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { canManageEnrollments, fetchAccess } from "../../courses/course-api";
import { StateView } from "../../state/StateView";
import { raised, spacing } from "../../theme";
import { Banner, Button, Screen, Text } from "../../ui";
import { ReasonSheet } from "../../instructors/ReasonSheet";
import { staffEntitlementApi } from "../entitlement-api";
import { StaffPageHeader } from "../../kit/StaffPageHeader";

/** People with access to one course. Granting and ending access are explicit, audited actions. */
export function StaffStudentsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = String(id);
  const [revoking, setRevoking] = useState<CourseStudent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const opener = useRef(null);

  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canManageEnrollments(access.data);
  const query = useInfiniteQuery({
    queryKey: ["course-students", courseId],
    enabled: allowed,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => staffEntitlementApi.list(courseId, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));

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
          message="You need permission to manage who can open this course."
          actionLabel="Back"
          onAction={back}
        />
      </Screen>
    );
  }

  const label = (s: CourseStudent) => s.user.displayName ?? s.user.email ?? "Unnamed person";

  const revoke = async (reason: string) => {
    if (!revoking) return;
    const who = label(revoking);
    try {
      await staffEntitlementApi.revoke(courseId, revoking.id, reason);
    } catch (e) {
      if (isAppError(e) && e.kind === "forbidden") {
        void qc.invalidateQueries({ queryKey: ["access"] });
      }
      throw e;
    }
    setRevoking(null);
    setMessage(null);
    await qc.invalidateQueries({ queryKey: ["course-students", courseId] });
    AccessibilityInfo.announceForAccessibility(`Access revoked for ${who}`);
  };

  return (
    <Screen>
      <StaffPageHeader title="Students" eyebrow="COURSE STUDIO" icon="book-open" />
      <Button
        label="Grant access"
        onPress={() => router.push(`/manage/${courseId}/students/grant`)}
      />
      {message ? <Banner kind="error" message={message} testID="students-error" /> : null}
      {query.status === "pending" ? (
        <StateView state="loading" />
      ) : query.status === "error" ? (
        <StateView
          state={isAppError(query.error) && query.error.kind === "network" ? "offline" : "error"}
          message={isAppError(query.error) ? query.error.message : messageFor("unknown")}
          requestId={isAppError(query.error) ? query.error.requestId : null}
          onAction={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <StateView
          state="empty"
          title="No one has access yet"
          message="Grant access by email. The person needs an active account with a verified email."
        />
      ) : (
        <View style={{ gap: spacing.md }} testID="course-students-list">
          {items.map((s) => (
            <View key={s.id} style={styles.row} testID={`student-${s.id}`}>
              <View style={{ gap: spacing.xs }}>
                <Text variant="subheading">{label(s)}</Text>
                {s.user.displayName && s.user.email ? (
                  <Text variant="caption" tone="muted">
                    {s.user.email}
                  </Text>
                ) : null}
                <Text variant="caption" tone="muted">
                  Reason: {s.grantReason}
                </Text>
              </View>
              <View ref={opener} collapsable={false}>
                <Button
                  label="Revoke"
                  variant="secondary"
                  accessibilityLabel={`Revoke access for ${label(s)}`}
                  onPress={() => setRevoking(s)}
                />
              </View>
            </View>
          ))}
          {query.hasNextPage ? (
            <Button
              label="Show more"
              variant="secondary"
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
      <Button label="Back" variant="tertiary" onPress={back} />
      <ReasonSheet
        visible={revoking !== null}
        title="Revoke access?"
        message={`${revoking ? label(revoking) : ""} will lose access to this course's lessons right away. They can be given access again later.`}
        confirmLabel="Revoke access"
        openerRef={opener}
        onConfirm={revoke}
        onCancel={() => setRevoking(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    ...raised,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
