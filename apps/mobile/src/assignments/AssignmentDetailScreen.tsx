import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { SUBMISSION_MAX } from "@chartnexa/api-contracts";
import { apiBaseUrl } from "../api/client";
import { isAppError, messageFor } from "../api/errors";
import { fileOpener } from "../resources/LessonFilesSection";
import { describeFile } from "../resources/upload";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { Banner, Button, Card, Screen, Text, TextField, useSubmitOnce } from "../ui";
import { assignmentApi, STATE_TEXT } from "./assignment-api";

/** One assignment: instructions, attachment, the student's answer and the instructor's feedback. */
export function AssignmentDetailScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const assignmentId = String(id);
  const q = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () => assignmentApi.get(assignmentId),
    retry: shouldRetry,
    staleTime: 0,
  });
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const saved = q.data?.submission?.body;
  useEffect(() => {
    if (saved !== undefined) setText(saved);
  }, [saved]);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/assignments"));

  const { run, pending } = useSubmitOnce(async () => {
    const body = text.trim();
    setMessage(null);
    if (body.length === 0) {
      setFieldError("Write your answer");
      return;
    }
    if (body.length > SUBMISSION_MAX) {
      setFieldError(`Use at most ${SUBMISSION_MAX} characters`);
      return;
    }
    setFieldError(undefined);
    try {
      await assignmentApi.submit(assignmentId, body);
      const t = q.data?.submission ? "Your answer was updated." : "Handed in. Well done.";
      setMessage({ ok: true, text: t });
      AccessibilityInfo.announceForAccessibility(t);
      await q.refetch();
      void qc.invalidateQueries({ queryKey: ["assignments"] });
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict") {
        setMessage({ ok: false, text: "This work has been reviewed, so it can no longer change." });
        void q.refetch();
        return;
      }
      if (isAppError(e) && e.kind === "not_found") {
        setMessage({ ok: false, text: "This assignment is no longer available." });
        return;
      }
      setMessage({ ok: false, text: isAppError(e) ? e.message : messageFor("unknown") });
    }
  });

  const openAttachment = async () => {
    if (opening) return;
    setOpening(true);
    setMessage(null);
    try {
      const link = await assignmentApi.attachmentLink(assignmentId);
      await fileOpener.download(`${apiBaseUrl()}${link.url}`);
    } catch (e) {
      setMessage({
        ok: false,
        text:
          isAppError(e) && e.kind === "not_found"
            ? "This file is no longer available."
            : isAppError(e)
              ? e.message
              : messageFor("unknown"),
      });
    } finally {
      setOpening(false);
    }
  };

  if (q.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (q.status === "error") {
    const e = q.error;
    return (
      <Screen>
        <StateView
          state={
            isAppError(e) && e.kind === "not_found"
              ? "empty"
              : isAppError(e) && e.kind === "network"
                ? "offline"
                : "error"
          }
          {...(isAppError(e) && e.kind === "not_found"
            ? {
                title: "Assignment not found",
                message: "It may have been withdrawn, or you no longer have access to the course.",
                actionLabel: "Back to assignments",
                onAction: back,
              }
            : {
                message: isAppError(e) ? e.message : messageFor("unknown"),
                onAction: () => void q.refetch(),
              })}
        />
      </Screen>
    );
  }
  const a = q.data;
  const locked = a.submission?.status === "reviewed";
  return (
    <Screen>
      <Text variant="caption" tone="muted">
        {a.courseTitle}
      </Text>
      <Text variant="title" accessibilityRole="header">
        {a.title}
      </Text>
      <Text tone={a.overdue ? "error" : "muted"}>
        {a.dueAt
          ? `${a.overdue ? "Overdue · " : ""}Due ${new Date(a.dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
          : "No due date"}{" "}
        · {STATE_TEXT[a.state]}
      </Text>
      <Text variant="subheading" accessibilityRole="header">
        Instructions
      </Text>
      <Text selectable testID="assignment-instructions">
        {a.instructions}
      </Text>
      {a.attachment ? (
        <Card>
          <Text variant="bodyStrong">{a.attachment.name}</Text>
          <Text variant="caption" tone="muted">
            {describeFile(a.attachment.mimeType, a.attachment.sizeBytes)}
          </Text>
          <Button
            label="Download attachment"
            variant="secondary"
            loading={opening}
            accessibilityLabel={`Download ${a.attachment.name}`}
            onPress={() => void openAttachment()}
          />
        </Card>
      ) : null}
      {message ? (
        <Banner
          kind={message.ok ? "success" : "error"}
          message={message.text}
          testID="assignment-msg"
        />
      ) : null}
      {a.submission?.feedback ? (
        <Card testID="assignment-feedback">
          <Text variant="subheading" accessibilityRole="header">
            Feedback from your instructor
          </Text>
          <Text selectable>{a.submission.feedback}</Text>
        </Card>
      ) : null}
      <Text variant="subheading" accessibilityRole="header">
        Your answer
      </Text>
      {locked ? (
        <>
          <Text selectable>{a.submission?.body}</Text>
          <Text variant="caption" tone="muted">
            Reviewed, so it can no longer change.
          </Text>
        </>
      ) : (
        <>
          <TextField
            label="Your answer"
            value={text}
            onChangeText={setText}
            error={fieldError}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            maxLength={SUBMISSION_MAX + 50}
          />
          <Text variant="caption" tone="muted">
            {text.trim().length}/{SUBMISSION_MAX}. You can change your answer until it is reviewed.
          </Text>
          <Button
            label={a.submission ? "Update answer" : "Hand in"}
            loading={pending}
            onPress={() => void run()}
          />
        </>
      )}
      <Button label="Back" variant="tertiary" onPress={back} />
    </Screen>
  );
}
