import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import {
  LIVE_CANCEL_REASON_MAX,
  LIVE_CANCEL_REASON_MIN,
  type StaffLiveSession,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canScheduleLive, fetchAccess } from "../courses/course-api";
import { StateView } from "../state/StateView";
import { neutrals, radii, spacing } from "../theme";
import { Banner, BottomSheet, Button, Screen, Text, TextField, useSubmitOnce } from "../ui";
import { durationText, STATE_TEXT, staffLiveApi, whenText } from "./live-api";

const joinedText = (n: number) =>
  n === 0 ? "No one has joined yet" : `${n} ${n === 1 ? "person" : "people"} joined`;

/** A course's live classes for staff: schedule, change and cancel. The server checks every call. */
export function StaffLiveScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = String(id);
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canScheduleLive(access.data, courseId);
  const list = useQuery({
    queryKey: ["live", "staff", courseId],
    queryFn: () => staffLiveApi.list(courseId),
    enabled: allowed,
  });
  const [cancelling, setCancelling] = useState<StaffLiveSession | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (access.status === "pending" || (allowed && list.status === "pending")) {
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
          message="You need permission to schedule live classes for this course."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/manage"))}
        />
      </Screen>
    );
  }
  if (list.status === "error") {
    const e = list.error;
    return (
      <Screen>
        <StateView
          state={isAppError(e) && e.kind === "network" ? "offline" : "error"}
          message={isAppError(e) ? e.message : messageFor("unknown")}
          onAction={() => void list.refetch()}
        />
      </Screen>
    );
  }
  const items = list.data ?? [];
  const upcoming = items.filter((s) => s.state !== "ended" && s.state !== "cancelled");
  const past = items.filter((s) => s.state === "ended" || s.state === "cancelled").reverse();

  const row = (s: StaffLiveSession) => (
    <View
      key={s.id}
      testID={`staff-live-${s.id}`}
      style={{
        borderWidth: 1,
        borderColor: neutrals.divider,
        borderRadius: radii.card,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <Text variant="subheading">{s.title}</Text>
      <Text>
        {whenText(s.startsAt)} · {durationText(s.durationMinutes)}
      </Text>
      <Text variant="caption" tone={s.state === "cancelled" ? "error" : "muted"}>
        {STATE_TEXT[s.state]} · {joinedText(s.joinedCount)}
      </Text>
      {s.cancelReason ? <Text tone="muted">Reason: {s.cancelReason}</Text> : null}
      {s.state !== "ended" && s.state !== "cancelled" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Button
            label="Edit"
            variant="secondary"
            accessibilityLabel={`Edit ${s.title}`}
            onPress={() => router.push(`/manage/${courseId}/live/${s.id}`)}
          />
          <Button
            label="Cancel class"
            variant="tertiary"
            accessibilityLabel={`Cancel ${s.title}`}
            onPress={() => {
              setInfo(null);
              setCancelling(s);
            }}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Live classes
      </Text>
      <Text tone="muted">
        Times are in your time zone. Students who own the course can join from 15 minutes before the
        start.
      </Text>
      {info ? <Banner kind="success" message={info} testID="live-info" /> : null}
      <Button
        label="Schedule a class"
        onPress={() => router.push(`/manage/${courseId}/live/new`)}
      />
      {upcoming.length === 0 ? (
        <StateView
          state="empty"
          title="No upcoming classes"
          message="Scheduled classes appear here."
        />
      ) : (
        upcoming.map(row)
      )}
      {past.length > 0 ? (
        <>
          <Text variant="subheading" accessibilityRole="header">
            Past and cancelled
          </Text>
          {past.map(row)}
        </>
      ) : null}
      <Button
        label="Back"
        variant="tertiary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace(`/manage/${courseId}`))}
      />
      <CancelSheet
        courseId={courseId}
        session={cancelling}
        onClose={() => setCancelling(null)}
        onDone={(text) => {
          setCancelling(null);
          setInfo(text);
          AccessibilityInfo.announceForAccessibility(text);
          void qc.invalidateQueries({ queryKey: ["live"] });
        }}
      />
    </Screen>
  );
}

function CancelSheet({
  courseId,
  session,
  onClose,
  onDone,
}: {
  courseId: string;
  session: StaffLiveSession | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const openFor = session?.id ?? null;
  useEffect(() => {
    if (openFor) {
      setReason("");
      setFieldError(undefined);
      setMessage(null);
    }
  }, [openFor]);

  const { run, pending } = useSubmitOnce(async () => {
    if (!session) return;
    setMessage(null);
    const r = reason.trim();
    if (r.length < LIVE_CANCEL_REASON_MIN || r.length > LIVE_CANCEL_REASON_MAX) {
      setFieldError(`Write ${LIVE_CANCEL_REASON_MIN} to ${LIVE_CANCEL_REASON_MAX} characters`);
      return;
    }
    setFieldError(undefined);
    try {
      await staffLiveApi.cancel(courseId, session.id, session.version, r);
      onDone("Class cancelled. Students will see the reason.");
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict") {
        await qc.invalidateQueries({ queryKey: ["live", "staff", courseId] });
        setMessage(
          e.code === "LIVE_ENDED"
            ? "This class has already ended."
            : "This class was changed by someone else. Close this, check it and try again.",
        );
        return;
      }
      if (isAppError(e) && e.kind === "validation" && e.fields.length > 0) {
        setFieldError(e.fields[0]?.message);
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

  return (
    <BottomSheet visible={session !== null} title="Cancel this class?" onDismiss={onClose}>
      {session ? (
        <Text>
          {session.title}, {whenText(session.startsAt)}. Students will see that it is cancelled and
          why. This cannot be undone.
        </Text>
      ) : null}
      {message ? <Banner kind="error" message={message} testID="cancel-error" /> : null}
      <TextField
        label="Reason students will see"
        value={reason}
        onChangeText={setReason}
        error={fieldError}
        maxLength={LIVE_CANCEL_REASON_MAX + 10}
      />
      <Button label="Cancel class" loading={pending} onPress={() => void run()} />
      <Button label="Keep class" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
