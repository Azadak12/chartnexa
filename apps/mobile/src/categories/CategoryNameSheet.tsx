import { useEffect, useState, type RefObject } from "react";
import { CATEGORY_NAME_MAX, CATEGORY_NAME_MIN } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { BottomSheet, Banner, Button, TextField, useSubmitOnce } from "../ui";

/** Add or rename a category. A taken name is shown on the field; typed text survives a failure. */
export function CategoryNameSheet({
  visible,
  title,
  initialName,
  confirmLabel,
  onSave,
  onClose,
  openerRef,
}: {
  visible: boolean;
  title: string;
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
    if (trimmed.length < CATEGORY_NAME_MIN || trimmed.length > CATEGORY_NAME_MAX) {
      setFieldError(`Use ${CATEGORY_NAME_MIN} to ${CATEGORY_NAME_MAX} characters`);
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
      {message ? <Banner kind="error" message={message} testID="category-error" /> : null}
      <TextField
        label="Category name"
        value={name}
        onChangeText={setName}
        error={fieldError}
        maxLength={CATEGORY_NAME_MAX + 10}
        autoCapitalize="words"
      />
      <Button label={confirmLabel} loading={pending} onPress={() => void run()} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}
