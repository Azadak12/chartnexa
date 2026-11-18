import { useEffect, useState, type RefObject } from "react";
import { REASON_MAX, REASON_MIN } from "@chartnexa/api-contracts";
import { formMessage } from "../auth/errors-ui";
import { BottomSheet, Banner, Button, Text, TextField, useSubmitOnce } from "../ui";

export interface ReasonSheetProps {
  visible: boolean;
  title: string;
  /** What will happen, in plain words. */
  message: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
  openerRef?: RefObject<unknown>;
}

/**
 * A short sheet that asks for a reason before a staff change. The typed reason stays after a
 * failed request; a successful or cancelled sheet starts empty next time.
 */
export function ReasonSheet({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  openerRef,
}: ReasonSheetProps) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setReason("");
      setFieldError(undefined);
      setError(null);
    }
  }, [visible]);
  const { run, pending } = useSubmitOnce(async () => {
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      setFieldError(`Write ${REASON_MIN} to ${REASON_MAX} characters`);
      return;
    }
    setFieldError(undefined);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (e) {
      setError(formMessage(e));
    }
  });
  return (
    <BottomSheet
      visible={visible}
      title={title}
      onDismiss={onCancel}
      {...(openerRef ? { openerRef } : {})}
    >
      <Text>{message}</Text>
      {error ? <Banner kind="error" message={error} testID="reason-error" /> : null}
      <TextField
        label="Reason"
        value={reason}
        onChangeText={setReason}
        error={fieldError}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        maxLength={REASON_MAX + 50}
      />
      <Button label={confirmLabel} loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </BottomSheet>
  );
}
