import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type RefObject } from "react";
import { AccessibilityInfo } from "react-native";
import { APPEAL_MESSAGE_MAX } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { BottomSheet, Banner, Button, Text, TextField, useSubmitOnce } from "../ui";
import { reviewsApi } from "./review-api";

/** The author asks a different moderator to look again. One appeal per hiding. */
export function AppealSheet({
  courseId,
  visible,
  onClose,
  openerRef,
}: {
  courseId: string;
  visible: boolean;
  onClose: () => void;
  openerRef?: RefObject<unknown>;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setText("");
      setFieldError(undefined);
      setMessage(null);
    }
  }, [visible]);

  const { run, pending } = useSubmitOnce(async () => {
    setMessage(null);
    if (text.trim().length === 0) {
      setFieldError("Tell us why you are appealing");
      return;
    }
    setFieldError(undefined);
    try {
      await reviewsApi.appeal(courseId, text.trim());
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict") {
        await qc.invalidateQueries({ queryKey: ["my-review", courseId] });
        AccessibilityInfo.announceForAccessibility("You have already appealed this");
        onClose();
        return;
      }
      if (isAppError(e) && e.kind === "validation" && e.fields.length > 0) {
        setFieldError(e.fields[0]?.message);
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["my-review", courseId] });
    AccessibilityInfo.announceForAccessibility("Appeal sent");
    onClose();
  });

  return (
    <BottomSheet
      visible={visible}
      title="Appeal this decision"
      onDismiss={onClose}
      {...(openerRef ? { openerRef } : {})}
    >
      <Text>A different moderator will read your message and decide.</Text>
      {message ? <Banner kind="error" message={message} testID="appeal-error" /> : null}
      <TextField
        label="Your message"
        value={text}
        onChangeText={setText}
        error={fieldError}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={APPEAL_MESSAGE_MAX + 50}
      />
      <Button label="Send appeal" loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
