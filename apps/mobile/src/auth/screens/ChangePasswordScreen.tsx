import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { applyServerErrors, changePasswordSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { accountApi } from "../account-api";
import { formMessage } from "../errors-ui";

export function ChangePasswordScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { control, handleSubmit, setError, reset } = useZodForm(changePasswordSchema, {
    currentPassword: "",
    newPassword: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { run, pending } = useSubmitOnce(
    async (v: { currentPassword: string; newPassword: string }) => {
      setMessage(null);
      setDone(false);
      try {
        await accountApi.changePassword(v);
        reset({ currentPassword: "", newPassword: "" });
        setDone(true);
        // Other devices were signed out by the server.
        await qc.invalidateQueries({ queryKey: ["sessions"] });
      } catch (e) {
        if (!applyServerErrors(e, setError, ["currentPassword", "newPassword"]))
          setMessage(formMessage(e));
      }
    },
  );

  return (
    <Screen keyboard narrow>
      <Text variant="title" accessibilityRole="header">
        Change password
      </Text>
      {done ? (
        <Banner
          kind="success"
          message="Password changed. Other devices have been signed out."
          testID="change-done"
        />
      ) : null}
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      <FormField
        control={control}
        name="currentPassword"
        label="Current password"
        password="current-password"
      />
      <FormField
        control={control}
        name="newPassword"
        label="New password"
        password="new-password"
      />
      <Text variant="caption" tone="muted">
        Use at least 10 characters. You stay signed in on this device.
      </Text>
      <Button
        label="Change password"
        loading={pending}
        onPress={() =>
          void handleSubmit((v) => run(v as { currentPassword: string; newPassword: string }))()
        }
      />
      <Button label="Back" variant="tertiary" onPress={() => router.back()} />
    </Screen>
  );
}
