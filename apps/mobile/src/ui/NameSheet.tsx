import { useEffect, useState, type RefObject } from "react";
import { isAppError, messageFor } from "../api/errors";
import { Banner } from "./Banner";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { useSubmitOnce } from "./use-submit-once";

/**
 * Asks for one short name (a category, a module). A server field error shows on the field and the
 * typed text survives a failure.
 */
export function NameSheet({
  visible,
  title,
  label,
  min,
  max,
  initialName,
  confirmLabel,
  onSave,
  onClose,
  openerRef,
}: {
  visible: boolean;
  title: string;
  label: string;
  min: number;
  max: number;
  initialName: string;
  confirmLabel: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
  openerRef?: RefObject<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setFieldError(undefined);
      setMessage(null);
    }
  }, [visible, initialName]);

  const { run, pending } = useSubmitOnce(async () => {
    setMessage(null);
    const trimmed = name.trim();
    if (trimmed.length < min || trimmed.length > max) {
      setFieldError(
        min <= 1
          ? trimmed.length === 0
            ? "Enter a name"
            : `Use ${max} characters or fewer`
          : `Use ${min} to ${max} characters`,
      );
      return;
    }
    setFieldError(undefined);
    try {
      await onSave(trimmed);
    } catch (e) {
      if (isAppError(e) && e.kind === "validation" && e.fields.length > 0) {
        setFieldError(e.fields[0]?.message);
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

  return (
    <BottomSheet
      visible={visible}
      title={title}
      onDismiss={onClose}
      {...(openerRef ? { openerRef } : {})}
    >
      {message ? <Banner kind="error" message={message} testID="name-sheet-error" /> : null}
      <TextField
        label={label}
        value={name}
        onChangeText={setName}
        error={fieldError}
        maxLength={max + 10}
        autoCapitalize="words"
      />
      <Button label={confirmLabel} loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
