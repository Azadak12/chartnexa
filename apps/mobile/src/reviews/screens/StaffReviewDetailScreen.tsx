import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, type RefObject } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import {
  MODERATION_NOTE_MAX,
  OTHER_NOTE_MIN,
  type ReviewReason,
  type StaffReviewDetail,
} from "@chartnexa/api-contracts";
import { isAppError } from "../../api/errors";
import { ConfirmDialog } from "../../auth/ConfirmDialog";
import { formMessage } from "../../auth/errors-ui";
import { canModerateReviews, fetchAccess, isAdmin } from "../../courses/course-api";
import { shouldRetry } from "../../state/query-client";
import { StateView } from "../../state/StateView";
import { colors, MIN_TOUCH_SIZE, neutrals, radii, spacing } from "../../theme";
import { BottomSheet, Banner, Button, Screen, Text, TextField, useSubmitOnce } from "../../ui";
import { OTHER_NOTE_HINT, REASON_LABEL } from "../moderation-labels";
import { moderationApi } from "../moderation-api";
import { ReasonPicker } from "../ReasonPicker";

const date = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

function HideSheet({
  visible,
  onCancel,
  onConfirm,
  openerRef,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (reason: ReviewReason, note: string) => Promise<void>;
  openerRef: RefObject<unknown>;
}) {
  const [reason, setReason] = useState<ReviewReason | null>(null);
  const [note, setNote] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [noteError, setNoteError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setReason(null);
      setNote("");
      setReasonError(undefined);
      setNoteError(undefined);
      setError(null);
    }
  }, [visible]);
  const { run, pending } = useSubmitOnce(async () => {
    setError(null);
    if (!reason) {
      setReasonError("Choose a reason");
      return;
    }
    if (reason === "other" && note.trim().length < OTHER_NOTE_MIN) {
      setNoteError(OTHER_NOTE_HINT);
      return;
    }
    setReasonError(undefined);
    setNoteError(undefined);
    try {
      await onConfirm(reason, note.trim());
    } catch (e) {
      setError(formMessage(e));
    }
  });
  return (
    <BottomSheet
      visible={visible}
      title="Hide this review"
      onDismiss={onCancel}
      openerRef={openerRef}
    >
      <Text>
        The review leaves public lists and the rating. The author will see the reason and your note.
        Hiding is never based on how many stars a review gave.
      </Text>
      {error ? <Banner kind="error" message={error} testID="hide-error" /> : null}
      <ReasonPicker value={reason} onChange={setReason} error={reasonError} />
      <TextField
        label="Note for the author"
        value={note}
        onChangeText={setNote}
        error={noteError}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        maxLength={MODERATION_NOTE_MAX}
      />
      <Button label="Hide review" loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </BottomSheet>
  );
}

function DecideSheet({
  visible,
  onCancel,
  onConfirm,
  openerRef,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (decision: "uphold" | "overturn", note: string) => Promise<void>;
  openerRef: RefObject<unknown>;
}) {
  const [decision, setDecision] = useState<"uphold" | "overturn" | null>(null);
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setDecision(null);
      setNote("");
      setFieldError(undefined);
      setError(null);
    }
  }, [visible]);
  const { run, pending } = useSubmitOnce(async () => {
    setError(null);
    if (!decision) {
      setFieldError("Choose uphold or overturn");
      return;
    }
    setFieldError(undefined);
    try {
      await onConfirm(decision, note.trim());
    } catch (e) {
      setError(formMessage(e));
    }
  });
  const options = [
    { id: "overturn" as const, label: "Overturn: show the review again" },
    { id: "uphold" as const, label: "Uphold: keep it hidden" },
  ];
  return (
    <BottomSheet
      visible={visible}
      title="Decide this appeal"
      onDismiss={onCancel}
      openerRef={openerRef}
    >
      {error ? <Banner kind="error" message={error} testID="decide-error" /> : null}
      <View accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
        {options.map((o) => {
          const on = decision === o.id;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: on, selected: on }}
              onPress={() => setDecision(o.id)}
              style={{
                minHeight: MIN_TOUCH_SIZE,
                justifyContent: "center",
                paddingHorizontal: spacing.md,
                borderRadius: radii.card,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.blue : neutrals.divider,
              }}
            >
              <Text variant={on ? "bodyStrong" : "body"}>{o.label}</Text>
            </Pressable>
          );
        })}
        {fieldError ? (
          <Text variant="caption" tone="error" accessibilityRole="alert">
            {fieldError}
          </Text>
        ) : null}
      </View>
      <TextField
        label="Note for the author (optional)"
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        maxLength={MODERATION_NOTE_MAX}
      />
      <Button label="Save decision" loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </BottomSheet>
  );
}

/** One review with its reports and appeals, and the moderator's actions. */
export function StaffReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canModerateReviews(access.data);
  const query = useQuery({
    queryKey: ["staff-review", id],
    enabled: allowed && !!id,
    retry: shouldRetry,
    queryFn: () => moderationApi.detail(id!),
  });
  const [hiding, setHiding] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hideRef = useRef(null);
  const restoreRef = useRef(null);
  const decideRef = useRef(null);

  const refresh = async (d: StaffReviewDetail) => {
    qc.setQueryData(["staff-review", id], d);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["staff-reviews"] }),
      qc.invalidateQueries({ queryKey: ["reviews", d.courseId] }),
      qc.invalidateQueries({ queryKey: ["course", d.courseId] }),
      qc.invalidateQueries({ queryKey: ["catalog"] }),
    ]);
  };
  const lost = (e: unknown): boolean => {
    if (isAppError(e) && e.kind === "forbidden") {
      setMessage("You can no longer do this. Your permission may have changed.");
      void qc.invalidateQueries({ queryKey: ["access"] });
      return true;
    }
    return false;
  };

  if (access.status === "pending" || (allowed && query.status === "pending")) {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (!allowed) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="Only moderators can review reported reviews."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
        />
      </Screen>
    );
  }
  if (query.status === "error") {
    const gone = isAppError(query.error) && query.error.kind === "not_found";
    return (
      <Screen>
        <StateView
          state={gone ? "empty" : "error"}
          {...(gone
            ? { title: "Review not found", message: "It may have been deleted by its author." }
            : {})}
          message={gone ? "It may have been deleted by its author." : formMessage(query.error)}
          actionLabel={gone ? "Back" : "Try again"}
          onAction={() => (gone ? router.back() : void query.refetch())}
        />
      </Screen>
    );
  }
  const d = query.data!;
  const openAppeal = d.appeals.find((a) => a.status === "open");
  const mustWait = d.hiddenByMe && !isAdmin(access.data);

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Review
      </Text>
      {message ? <Banner kind="error" message={message} testID="staff-review-error" /> : null}
      <View style={{ gap: spacing.xs }} testID="staff-review-body">
        <Text variant="bodyStrong">{d.courseTitle}</Text>
        <Text variant="caption" tone="muted">
          {d.rating} {d.rating === 1 ? "star" : "stars"} · {d.reviewerName} · {date(d.createdAt)}
        </Text>
        <Text>{d.body || "No text"}</Text>
      </View>
      <Text variant="bodyStrong" testID="staff-review-state">
        {d.hidden
          ? `Hidden: ${d.hiddenReason ? REASON_LABEL[d.hiddenReason] : ""}${d.hiddenNote ? `. Note: ${d.hiddenNote}` : ""}`
          : "Visible to everyone"}
      </Text>

      <View style={{ gap: spacing.sm }}>
        <Text variant="subheading" accessibilityRole="header">
          Reports ({d.reports.filter((r) => !r.resolved).length} open)
        </Text>
        {d.reports.length === 0 ? <Text tone="muted">No reports.</Text> : null}
        {d.reports.map((r) => (
          <Text key={r.id}>
            {REASON_LABEL[r.reason]}
            {r.note ? `: ${r.note}` : ""} · {date(r.createdAt)} · {r.resolved ? "Settled" : "Open"}
          </Text>
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="subheading" accessibilityRole="header">
          Appeals
        </Text>
        {d.appeals.length === 0 ? <Text tone="muted">No appeals.</Text> : null}
        {d.appeals.map((a) => (
          <Text key={a.id}>
            {a.status === "open" ? "Open" : a.status === "upheld" ? "Upheld" : "Overturned"} ·{" "}
            {date(a.createdAt)}: {a.message}
            {a.decidedNote ? ` (Decision note: ${a.decidedNote})` : ""}
          </Text>
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        {!d.hidden ? (
          <View ref={hideRef} collapsable={false}>
            <Button label="Hide review" onPress={() => setHiding(true)} />
          </View>
        ) : (
          <View ref={restoreRef} collapsable={false}>
            <Button label="Restore review" variant="secondary" onPress={() => setRestoring(true)} />
          </View>
        )}
        {openAppeal && !mustWait ? (
          <View ref={decideRef} collapsable={false}>
            <Button label="Decide appeal" onPress={() => setDeciding(true)} />
          </View>
        ) : null}
        {openAppeal && mustWait ? (
          <Text testID="must-wait">
            You hid this review, so another moderator needs to decide the appeal.
          </Text>
        ) : null}
      </View>

      <HideSheet
        visible={hiding}
        openerRef={hideRef}
        onCancel={() => setHiding(false)}
        onConfirm={async (reason, note) => {
          try {
            const res = await moderationApi.hide(d.id, { reason, note });
            await refresh(res.review);
          } catch (e) {
            if (lost(e)) {
              setHiding(false);
              return;
            }
            throw e;
          }
          setHiding(false);
          AccessibilityInfo.announceForAccessibility("Review hidden");
        }}
      />
      <ConfirmDialog
        visible={restoring}
        title="Restore this review?"
        message="It will show on the course page again and count in the rating."
        confirmLabel="Restore review"
        openerRef={restoreRef}
        onCancel={() => setRestoring(false)}
        onConfirm={async () => {
          try {
            const res = await moderationApi.restore(d.id);
            await refresh(res.review);
          } catch (e) {
            if (lost(e)) {
              setRestoring(false);
              return;
            }
            throw e;
          }
          setRestoring(false);
          AccessibilityInfo.announceForAccessibility("Review restored");
        }}
      />
      <DecideSheet
        visible={deciding}
        openerRef={decideRef}
        onCancel={() => setDeciding(false)}
        onConfirm={async (decision, note) => {
          try {
            const res = await moderationApi.decide(openAppeal!.id, { decision, note });
            await refresh(res.review);
          } catch (e) {
            if (isAppError(e) && e.kind === "conflict") {
              setMessage("Someone else already decided this appeal.");
              await query.refetch();
              setDeciding(false);
              return;
            }
            if (isAppError(e) && e.kind === "forbidden") {
              setMessage("Another moderator needs to decide this appeal.");
              setDeciding(false);
              return;
            }
            throw e;
          }
          setDeciding(false);
          AccessibilityInfo.announceForAccessibility("Decision saved");
        }}
      />
    </Screen>
  );
}
