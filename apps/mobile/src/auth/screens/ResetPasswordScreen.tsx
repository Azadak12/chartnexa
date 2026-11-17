import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { isAppError } from "../../api/errors";
import { applyServerErrors, resetFormSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { sessionStore } from "../../session/session-store";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { authHttp } from "../auth-http";
import { formMessage } from "../errors-ui";

export const INVALID_CODE_MESSAGE = "This code is invalid or has expired.";

/** Opened from the emailed link (the code arrives as `token`) or by pasting the code by hand. */
export function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { control, handleSubmit, setError } = useZodForm(resetFormSchema, {
    token: token ?? "",
    newPassword: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [badCode, setBadCode] = useState(false);

  const { run, pending } = useSubmitOnce(async (v: { token: string; newPassword: string }) => {
    setMessage(null);
    setBadCode(false);
    try {
      await authHttp.resetPassword(v);
      sessionStore.setNotice("Password changed. Please sign in with your new password.");
      router.replace("/sign-in");
    } catch (e) {
      if (applyServerErrors(e, setError, ["newPassword", "token"])) return;
      // An invalid, used or expired code has no field: one generic message for all three.
      if (isAppError(e) && e.kind === "validation") setBadCode(true);
      else setMessage(formMessage(e));
    }
  });

  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Choose a new password
      </Text>
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      {badCode ? (
        <>
          <Banner kind="error" message={INVALID_CODE_MESSAGE} testID="bad-code" />
          <Button
            label="Request a new reset email"
            variant="secondary"
            onPress={() => router.replace("/forgot-password")}
          />
        </>
      ) : null}
      <FormField
        control={control}
        name="token"
        label="Code from your email"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FormField
        control={control}
        name="newPassword"
        label="New password"
        password="new-password"
      />
      <Text variant="caption" tone="muted">
        Use at least 10 characters. Signing in elsewhere will end.
      </Text>
      <Button
        label="Change password"
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v as { token: string; newPassword: string }))()}
      />
    </Screen>
  );
}
