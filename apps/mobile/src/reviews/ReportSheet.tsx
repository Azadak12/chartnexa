import { useEffect, useState, type RefObject } from "react";
import { AccessibilityInfo } from "react-native";
import { REPORT_NOTE_MAX, type ReviewReason } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { BottomSheet, Banner, Button, Text, TextField, useSubmitOnce } from "../ui";
import { reviewsApi } from "./review-api";
import { ReasonPicker } from "./ReasonPicker";

/**
 * Report someone else's review. Sending it twice is safe (the server keeps one open report), and
 * a review that disappeared meanwhile gets a calm message rather than an error code.
 */
export function ReportSheet({
  courseId,
  reviewId,
  visible,
  onClose,
  openerRef,
}: {
  courseId: string;
  reviewId: string;
  visible: boolean;
  onClose: () => void;
  openerRef?: RefObject<unknown>;
}) {
  const [reason, setReason] = useState<ReviewReason | null>(null);
  const [note, setNote] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setReason(null);
      setNote("");
      setReasonError(undefined);
      setMessage(null);
    }
  }, [visible]);

  const { run, pending } = useSubmitOnce(async () => {
    setMessage(null);
    if (!reason) {
      setReasonError("Choose a reason");
      return;
    }
    setReasonError(undefined);
    try {
      await reviewsApi.report(courseId, reviewId, { reason, note: note.trim() });
    } catch (e) {
      if (isAppError(e) && e.kind === "not_found") {
        AccessibilityInfo.announceForAccessibility("This review is no longer available");
        setMessage("This review is no longer available.");
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
      return;
    }
    AccessibilityInfo.announceForAccessibility("Report sent");
    onClose();
  });

  return (
    <BottomSheet
      visible={visible}
      title="Report this review"
      onDismiss={onClose}
      {...(openerRef ? { openerRef } : {})}
    >
      <Text>
        Tell us what is wrong. A moderator will look at it. Your name is never shown to the author.
      </Text>
      {message ? <Banner kind="error" message={message} testID="report-error" /> : null}
      <ReasonPicker
        value={reason}
        onChange={(r) => {
          setReason(r);
          setReasonError(undefined);
        }}
        error={reasonError}
      />
      <TextField
        label="Details (optional)"
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        maxLength={REPORT_NOTE_MAX}
      />
      <Button label="Send report" loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
