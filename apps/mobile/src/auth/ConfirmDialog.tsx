import { useState, type RefObject } from "react";
import { View } from "react-native";
import { formMessage } from "./errors-ui";
import { Banner, Button, Dialog, Text, useSubmitOnce } from "../ui";

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  /** Names the consequence in plain words. */
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  openerRef?: RefObject<unknown>;
}

/** Destructive actions always ask first; Cancel and the back button close it without acting. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  openerRef,
}: ConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useSubmitOnce(async () => {
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(formMessage(e));
    }
  });
  return (
    <Dialog
      visible={visible}
      title={title}
      onDismiss={onCancel}
      {...(openerRef ? { openerRef } : {})}
    >
      <Text>{message}</Text>
      {error ? <Banner kind="error" message={error} testID="confirm-error" /> : null}
      <View style={{ gap: 8 }}>
        <Button label={confirmLabel} loading={pending} onPress={() => void run()} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </Dialog>
  );
}
