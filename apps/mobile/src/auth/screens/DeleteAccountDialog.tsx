import type { RefObject } from "react";
import { useState } from "react";
import { applyServerErrors, deleteSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { isAppError } from "../../api/errors";
import { Banner, Button, Dialog, Text, useSubmitOnce } from "../../ui";
import { accountApi } from "../account-api";
import { formMessage } from "../errors-ui";
import { sessionManager } from "../session-manager";

export const LAST_ADMIN_TEXT =
  "You are the only Admin. Appoint another Admin before deleting this account.";

/** Says what deletion does first, then asks for the password. */
export function DeleteAccountDialog({
  visible,
  onClose,
  openerRef,
}: {
  visible: boolean;
  onClose: () => void;
  openerRef: RefObject<unknown>;
}) {
  const { control, handleSubmit, setError, reset } = useZodForm(deleteSchema, { password: "" });
  const [message, setMessage] = useState<string | null>(null);
  const close = () => {
    reset({ password: "" });
    setMessage(null);
    onClose();
  };
  const { run, pending } = useSubmitOnce(async (v: { password: string }) => {
    setMessage(null);
    try {
      await accountApi.deleteAccount(v);
      await sessionManager.clearAfterServerEnd("Your account was deleted.");
    } catch (e) {
      if (applyServerErrors(e, setError, ["password"])) return;
      setMessage(isAppError(e) && e.kind === "conflict" ? LAST_ADMIN_TEXT : formMessage(e));
    }
  });
  return (
    <Dialog visible={visible} title="Delete your account?" onDismiss={close} openerRef={openerRef}>
      <Text>
        This permanently removes your personal data and signs you out on every device. This cannot
        be undone. Enter your password to confirm.
      </Text>
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      <FormField control={control} name="password" label="Password" password="current-password" />
      <Button
        label="Delete my account"
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v as { password: string }))()}
      />
      <Button label="Cancel" variant="secondary" onPress={close} />
    </Dialog>
  );
}
