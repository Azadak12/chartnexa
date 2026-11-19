import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { FEEDBACK_MAX, type EnrolledStudent, type Recipient } from "@chartnexa/api-contracts";
import { apiBaseUrl } from "../api/client";
import { isAppError, messageFor } from "../api/errors";
import { canManageAssignments, fetchAccess } from "../courses/course-api";
import { fileOpener } from "../resources/LessonFilesSection";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { neutrals, radii, spacing } from "../theme";
import { Banner, BottomSheet, Button, Chip, Screen, Text, TextField, useSubmitOnce } from "../ui";
import { RECIPIENT_TEXT, staffAssignmentApi } from "./assignment-api";

const due = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "No due date";
const nameOf = (r: { displayName: string | null; email: string | null }) =>
  r.displayName ?? r.email ?? "Student";

/** Run an assignment: publish it, assign it, see who has handed in, and give feedback. */
export function AssignmentManageScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id, assignmentId } = useLocalSearchParams<{ id: string; assignmentId: string }>();
  const courseId = String(id);
  const aid = String(assignmentId);
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canManageAssignments(access.data, courseId);
  const a = useQuery({
    queryKey: ["staff-assignment", courseId, aid],
    queryFn: () => staffAssignmentApi.get(courseId, aid),
    enabled: allowed,
    retry: shouldRetry,
    staleTime: 0,
  });
  const recipients = useQuery({
    queryKey: ["assignment-recipients", courseId, aid],
    queryFn: () => staffAssignmentApi.recipients(courseId, aid),
    enabled: allowed,
    staleTime: 0,
  });
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [reviewing, setReviewing] = useState<Recipient | null>(null);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/manage/${courseId}/assignments`);
  const refresh = () => {
    void a.refetch();
    void recipients.refetch();
    void qc.invalidateQueries({ queryKey: ["staff-assignments", courseId] });
  };

  const publish = async () => {
    if (!a.data) return;
    setInfo(null);
    setError(null);
    try {
      await staffAssignmentApi.update(courseId, aid, {
        expectedVersion: a.data.version,
        status: "published",
      });
      setInfo("Published. You can now assign it to students.");
      refresh();
    } catch (e) {
      setError(isAppError(e) ? e.message : messageFor("unknown"));
      refresh();
    }
  };
  const openAttachment = async () => {
    try {
      const link = await staffAssignmentApi.attachmentLink(courseId, aid);
      await fileOpener.download(`${apiBaseUrl()}${link.url}`);
    } catch (e) {
      setError(isAppError(e) ? e.message : messageFor("unknown"));
    }
  };

  if (access.status === "pending" || (allowed && a.status === "pending")) {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error" || !allowed || a.status === "error") {
    const e = access.status === "error" ? access.error : a.error;
    return (
      <Screen>
        {!allowed && access.status !== "error" ? (
          <StateView
            state="empty"
            title="You do not have access"
            message="You need permission to manage assignments for this course."
            actionLabel="Back"
            onAction={back}
          />
        ) : isAppError(e) && e.kind === "not_found" ? (
          <StateView
            state="empty"
            title="Assignment not found"
            message="It may have been removed."
            actionLabel="Back"
            onAction={back}
          />
        ) : (
          <StateView
            state={isAppError(e) && e.kind === "network" ? "offline" : "error"}
            message={isAppError(e) ? e.message : messageFor("unknown")}
            onAction={refresh}
          />
        )}
      </Screen>
    );
  }
  const d = a.data;
  if (!d) {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  const people = recipients.data ?? [];
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {d.title}
      </Text>
      <Text tone={d.status === "draft" ? "muted" : "link"}>
        {d.status === "draft" ? "Draft" : "Published"} · {due(d.dueAt)}
        {d.lessonTitle ? ` · ${d.lessonTitle}` : ""}
      </Text>
      <Text variant="caption" tone="muted">
        {d.assignedCount} assigned · {d.submittedCount} handed in · {d.reviewedCount} reviewed
      </Text>
      {info ? <Banner kind="success" message={info} testID="manage-info" /> : null}
      {error ? <Banner kind="error" message={error} testID="manage-error" /> : null}
      <Text selectable>{d.instructions}</Text>
      {d.attachment ? (
        <Button
          label={`Open ${d.attachment.name}`}
          variant="secondary"
          onPress={() => void openAttachment()}
        />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Button
          label="Edit"
          variant="secondary"
          onPress={() => router.push(`/manage/${courseId}/assignments/${aid}/edit`)}
        />
        {d.status === "draft" ? <Button label="Publish" onPress={() => void publish()} /> : null}
        {d.status === "published" ? (
          <Button label="Assign to students" onPress={() => setAssigning(true)} />
        ) : null}
      </View>
      {d.status === "draft" ? (
        <Text variant="caption" tone="muted">
          Students see an assignment only after it is published and assigned to them.
        </Text>
      ) : null}

      <Text variant="subheading" accessibilityRole="header">
        Students
      </Text>
      {recipients.status === "pending" ? (
        <Text tone="muted">Loading students…</Text>
      ) : recipients.status === "error" ? (
        <StateView
          state="error"
          message="Students could not be loaded."
          onAction={() => void recipients.refetch()}
        />
      ) : people.length === 0 ? (
        <Text tone="muted">Nobody has this assignment yet.</Text>
      ) : (
        people.map((r) => (
          <View
            key={r.userId}
            testID={`recipient-${r.userId}`}
            style={{
              borderWidth: 1,
              borderColor: neutrals.divider,
              borderRadius: radii.card,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text variant="subheading">{nameOf(r)}</Text>
            <Text
              variant="caption"
              tone={
                r.state === "not_started" ? "muted" : r.state === "reviewed" ? "success" : "link"
              }
            >
              {RECIPIENT_TEXT[r.state]}
              {r.submittedAt ? ` · ${due(r.submittedAt).replace("Due ", "")}` : ""}
            </Text>
            {r.state !== "not_started" ? (
              <Button
                label={r.state === "reviewed" ? "View work" : "Review"}
                variant="secondary"
                accessibilityLabel={`${r.state === "reviewed" ? "View" : "Review"} work of ${nameOf(r)}`}
                onPress={() => setReviewing(r)}
              />
            ) : null}
          </View>
        ))
      )}
      <Button label="Back" variant="tertiary" onPress={back} />

      <AssignSheet
        visible={assigning}
        courseId={courseId}
        assignmentId={aid}
        onClose={() => setAssigning(false)}
        onDone={(text) => {
          setAssigning(false);
          setInfo(text);
          AccessibilityInfo.announceForAccessibility(text);
          refresh();
        }}
      />
      <ReviewSheet
        courseId={courseId}
        assignmentId={aid}
        person={reviewing}
        onClose={() => setReviewing(null)}
        onDone={(text) => {
          setReviewing(null);
          setInfo(text);
          AccessibilityInfo.announceForAccessibility(text);
          refresh();
        }}
      />
    </Screen>
  );
}

function AssignSheet({
  visible,
  courseId,
  assignmentId,
  onClose,
  onDone,
}: {
  visible: boolean;
  courseId: string;
  assignmentId: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const students = useQuery({
    queryKey: ["enrolled-students", courseId],
    queryFn: () => staffAssignmentApi.enrolled(courseId),
    enabled: visible,
    staleTime: 0,
  });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [everyone, setEveryone] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setChosen(new Set());
      setEveryone(true);
      setMessage(null);
    }
  }, [visible]);
  const toggle = (u: EnrolledStudent) => {
    const next = new Set(chosen);
    if (next.has(u.userId)) next.delete(u.userId);
    else next.add(u.userId);
    setChosen(next);
  };
  const { run, pending } = useSubmitOnce(async () => {
    setMessage(null);
    if (!everyone && chosen.size === 0) {
      setMessage("Choose at least one student, or everyone.");
      return;
    }
    try {
      const r = await staffAssignmentApi.assign(
        courseId,
        assignmentId,
        everyone ? { all: true } : { userIds: [...chosen] },
      );
      onDone(
        r.assigned === 0
          ? "Everyone chosen already had this assignment."
          : `Assigned to ${r.assigned} ${r.assigned === 1 ? "student" : "students"}.`,
      );
    } catch (e) {
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });
  return (
    <BottomSheet visible={visible} title="Assign to students" onDismiss={onClose}>
      {message ? <Banner kind="error" message={message} testID="assign-error" /> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Chip label="Everyone with access" selected={everyone} onPress={() => setEveryone(true)} />
        <Chip label="Choose students" selected={!everyone} onPress={() => setEveryone(false)} />
      </View>
      {!everyone ? (
        students.status === "pending" ? (
          <Text tone="muted">Loading students…</Text>
        ) : students.status === "error" ? (
          <Text tone="error">Students could not be loaded.</Text>
        ) : students.data.length === 0 ? (
          <Text tone="muted">Nobody has access to this course yet.</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {students.data.map((s) => (
              <Chip
                key={s.userId}
                label={nameOf(s)}
                selected={chosen.has(s.userId)}
                onPress={() => toggle(s)}
              />
            ))}
          </View>
        )
      ) : (
        <Text tone="muted">Everyone with access now gets it. People who join later do not.</Text>
      )}
      <Button label="Assign" loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}

function ReviewSheet({
  courseId,
  assignmentId,
  person,
  onClose,
  onDone,
}: {
  courseId: string;
  assignmentId: string;
  person: Recipient | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const sub = useQuery({
    queryKey: ["assignment-submission", courseId, assignmentId, person?.userId],
    queryFn: () => staffAssignmentApi.submission(courseId, assignmentId, person?.userId as string),
    enabled: person !== null,
    staleTime: 0,
  });
  const [feedback, setFeedback] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const existing = sub.data?.feedback;
  useEffect(() => {
    setFeedback(existing ?? "");
    setFieldError(undefined);
    setMessage(null);
  }, [existing, person?.userId]);
  const { run, pending } = useSubmitOnce(async () => {
    if (!person) return;
    const f = feedback.trim();
    if (f.length === 0 || f.length > FEEDBACK_MAX) {
      setFieldError(
        f.length === 0 ? "Write your feedback" : `Use at most ${FEEDBACK_MAX} characters`,
      );
      return;
    }
    setFieldError(undefined);
    setMessage(null);
    try {
      await staffAssignmentApi.feedback(courseId, assignmentId, person.userId, f);
      onDone("Feedback sent. The work is now reviewed.");
    } catch (e) {
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });
  return (
    <BottomSheet
      visible={person !== null}
      title={person ? nameOf(person) : "Work"}
      onDismiss={onClose}
    >
      {sub.status === "pending" ? (
        <Text tone="muted">Loading their work…</Text>
      ) : sub.status === "error" ? (
        <StateView
          state="error"
          message="Their work could not be loaded."
          onAction={() => void sub.refetch()}
        />
      ) : (
        <>
          <Text variant="caption" tone="muted">
            Handed in {new Date(sub.data.submittedAt).toLocaleString()}
            {sub.data.late ? " · late" : ""}
          </Text>
          <Text selectable testID="submission-body">
            {sub.data.body}
          </Text>
          {message ? <Banner kind="error" message={message} testID="review-error" /> : null}
          <TextField
            label="Feedback"
            value={feedback}
            onChangeText={setFeedback}
            error={fieldError}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={FEEDBACK_MAX + 50}
          />
          <Button
            label={existing ? "Update feedback" : "Send feedback"}
            loading={pending}
            onPress={() => void run()}
          />
        </>
      )}
      <Button label="Close" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
