import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import {
  INVITATION_STATUSES,
  type InstructorSummary,
  type Invitation,
  type InvitationStatus,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canInviteInstructors, canManageRoles, fetchAccess } from "../courses/course-api";
import { ReasonSheet } from "../instructors/ReasonSheet";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { raised, spacing } from "../theme";
import { Banner, BottomSheet, Button, Chip, Screen, Text, TextField, useSubmitOnce } from "../ui";
import { invitationApi, STATUS_TEXT } from "./invitation-api";
import { StaffPageHeader } from "../kit/StaffPageHeader";

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const card = {
  ...raised,
  padding: spacing.md,
  gap: spacing.xs,
} as const;

/** Invite Instructors and follow their invitations; Admins also manage current Instructors. */
export function InvitationsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canInviteInstructors(access.data);
  const isAdmin = canManageRoles(access.data);
  const [filter, setFilter] = useState<InvitationStatus | undefined>(undefined);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<InstructorSummary | null>(null);

  const list = useInfiniteQuery({
    queryKey: ["invitations", filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => invitationApi.list(filter, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: shouldRetry,
    enabled: allowed,
    staleTime: 0,
  });
  const instructors = useQuery({
    queryKey: ["instructors"],
    queryFn: invitationApi.instructors,
    enabled: allowed,
    staleTime: 0,
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/profile"));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["invitations"] });
    void qc.invalidateQueries({ queryKey: ["instructors"] });
  };
  const done = (text: string) => {
    setInfo(text);
    setError(null);
    AccessibilityInfo.announceForAccessibility(text);
    refresh();
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setInfo(null);
    setError(null);
    try {
      await fn();
      done(ok);
    } catch (e) {
      setError(isAppError(e) ? e.message : messageFor("unknown"));
      refresh();
    }
  };

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
            message="Only Admins and Managers can invite Instructors."
            actionLabel="Back"
            onAction={back}
          />
        )}
      </Screen>
    );
  }
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Screen>
      <StaffPageHeader title="Instructors" eyebrow="OPERATIONS" icon="inbox" />
      {info ? <Banner kind="success" message={info} testID="inv-info" /> : null}
      {error ? <Banner kind="error" message={error} testID="inv-error" /> : null}
      <Button label="Invite an instructor" onPress={() => setInviting(true)} />

      <Text variant="subheading" accessibilityRole="header">
        Invitations
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip label="All" selected={filter === undefined} onPress={() => setFilter(undefined)} />
        {INVITATION_STATUSES.map((s) => (
          <Chip
            key={s}
            label={STATUS_TEXT[s]}
            selected={filter === s}
            onPress={() => setFilter(s)}
          />
        ))}
      </View>
      {list.status === "pending" ? (
        <StateView state="loading" />
      ) : list.status === "error" ? (
        <StateView
          state={isAppError(list.error) && list.error.kind === "network" ? "offline" : "error"}
          message={isAppError(list.error) ? list.error.message : messageFor("unknown")}
          onAction={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <StateView
          state="empty"
          title={filter ? "No invitations with this status" : "No invitations yet"}
          message="Invite someone to see their invitation here."
        />
      ) : (
        <>
          {items.map((i: Invitation) => (
            <View key={i.id} testID={`invitation-${i.id}`} style={card}>
              <Text variant="subheading">{i.email}</Text>
              <Text variant="caption" tone={i.status === "pending" ? "link" : "muted"}>
                {STATUS_TEXT[i.status]} ·{" "}
                {i.status === "accepted" && i.acceptedAt
                  ? `accepted ${when(i.acceptedAt)}`
                  : i.status === "revoked" && i.revokedAt
                    ? `revoked ${when(i.revokedAt)}`
                    : i.status === "expired"
                      ? `expired ${when(i.expiresAt)}`
                      : `expires ${when(i.expiresAt)}`}
              </Text>
              {i.invitedByName ? (
                <Text variant="caption" tone="muted">
                  Invited by {i.invitedByName}
                </Text>
              ) : null}
              {i.status === "pending" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  <Button
                    label="Resend"
                    variant="secondary"
                    accessibilityLabel={`Resend invitation to ${i.email}`}
                    onPress={() =>
                      void act(() => invitationApi.resend(i.id), `Sent again to ${i.email}.`)
                    }
                  />
                  <Button
                    label="Revoke"
                    variant="tertiary"
                    accessibilityLabel={`Revoke invitation to ${i.email}`}
                    onPress={() =>
                      void act(() => invitationApi.revoke(i.id), "Invitation revoked.")
                    }
                  />
                </View>
              ) : null}
              {i.status === "expired" ? (
                <Button
                  label="Invite again"
                  variant="secondary"
                  accessibilityLabel={`Invite ${i.email} again`}
                  onPress={() =>
                    void act(() => invitationApi.invite(i.email), `Invitation sent to ${i.email}.`)
                  }
                />
              ) : null}
            </View>
          ))}
          {list.hasNextPage ? (
            <Button
              label="Load more"
              variant="secondary"
              loading={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
            />
          ) : null}
        </>
      )}

      <Text variant="subheading" accessibilityRole="header">
        Current instructors
      </Text>
      {instructors.status === "pending" ? (
        <Text tone="muted">Loading instructors…</Text>
      ) : instructors.status === "error" ? (
        <StateView
          state="error"
          message="Instructors could not be loaded."
          onAction={() => void instructors.refetch()}
        />
      ) : instructors.data.length === 0 ? (
        <Text tone="muted">No instructors yet. Accepted invitations appear here.</Text>
      ) : (
        instructors.data.map((t) => (
          <View key={t.id} testID={`instructor-${t.id}`} style={card}>
            <Text variant="subheading">{t.displayName ?? "Instructor"}</Text>
            <Text variant="caption" tone="muted">
              {t.email} · since {when(t.since)} · {t.courseCount}{" "}
              {t.courseCount === 1 ? "course" : "courses"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              <Button
                label="Permissions"
                variant="secondary"
                accessibilityLabel={`Permissions of ${t.displayName ?? t.email}`}
                onPress={() => router.push(`/profile/instructors/${t.id}`)}
              />
              {isAdmin ? (
                <Button
                  label="Deactivate"
                  variant="tertiary"
                  accessibilityLabel={`Deactivate ${t.displayName ?? t.email}`}
                  onPress={() => {
                    setInfo(null);
                    setDeactivating(t);
                  }}
                />
              ) : null}
            </View>
          </View>
        ))
      )}
      <Button label="Back" variant="tertiary" onPress={back} />

      <InviteSheet
        visible={inviting}
        onClose={() => setInviting(false)}
        onDone={(email) => {
          setInviting(false);
          done(`Invitation sent to ${email}.`);
        }}
      />
      <ReasonSheet
        visible={deactivating !== null}
        title="Deactivate this instructor?"
        message={`${deactivating?.displayName ?? deactivating?.email ?? "This person"} will lose the Instructor role, every course permission and every signed-in session. Their courses stay, with their name on them. This is recorded in the audit log.`}
        confirmLabel="Deactivate"
        onCancel={() => setDeactivating(null)}
        onConfirm={async (reason) => {
          if (!deactivating) return;
          const r = await invitationApi.deactivate(deactivating.id, reason);
          setDeactivating(null);
          done(
            `Deactivated. ${r.coursesKept} ${r.coursesKept === 1 ? "course stays" : "courses stay"} published.`,
          );
        }}
      />
    </Screen>
  );
}

function InviteSheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const { run, pending } = useSubmitOnce(async () => {
    setMessage(null);
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setFieldError("Enter a valid email address");
      return;
    }
    setFieldError(undefined);
    try {
      const inv = await invitationApi.invite(value);
      setEmail("");
      onDone(inv.email);
    } catch (e) {
      if (isAppError(e) && e.kind === "validation" && e.fields[0]) {
        setFieldError(e.fields[0].message);
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });
  return (
    <BottomSheet visible={visible} title="Invite an instructor" onDismiss={onClose}>
      <Text>
        They get an email with a link to accept. The invitation expires after 7 days. In
        development, emails are written to the API's .dev-mail folder.
      </Text>
      {message ? <Banner kind="error" message={message} testID="invite-error" /> : null}
      <TextField
        label="Email address"
        value={email}
        onChangeText={setEmail}
        error={fieldError}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <Button label="Send invitation" loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
