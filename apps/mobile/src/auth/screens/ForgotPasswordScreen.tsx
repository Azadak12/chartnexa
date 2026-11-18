import { useRouter } from "expo-router";
import { useState } from "react";
import { applyServerErrors, forgotSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { authHttp } from "../auth-http";
import { formMessage } from "../errors-ui";

export function ForgotPasswordScreen() {
  const router = useRouter();
  const { control, handleSubmit, setError } = useZodForm(forgotSchema, { email: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { run, pending } = useSubmitOnce(async (v: { email: string }) => {
    setMessage(null);
    try {
      await authHttp.forgotPassword(v);
      setDone(true);
    } catch (e) {
      if (!applyServerErrors(e, setError, ["email"])) setMessage(formMessage(e));
    }
  });

  if (done) {
    return (
      <Screen narrow>
        <Text variant="title" accessibilityRole="header">
          Check your email
        </Text>
        <Banner
          kind="success"
          message="If an account exists for that address, we have sent a link to reset the password. It works for 30 minutes."
          testID="forgot-done"
        />
        <Button
          label="Enter a code instead"
          variant="secondary"
          onPress={() => router.push("/reset-password")}
        />
        <Button
          label="Back to sign in"
          variant="tertiary"
          onPress={() => router.replace("/sign-in")}
        />
      </Screen>
    );
  }

  return (
    <Screen keyboard narrow>
      <Text variant="title" accessibilityRole="header">
        Forgot password
      </Text>
      <Text tone="muted">
        Enter your email and we will send you a link to choose a new password.
      </Text>
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      <FormField
        control={control}
        name="email"
        label="Email"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label="Send reset link"
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v as { email: string }))()}
      />
      <Button
        label="Back to sign in"
        variant="tertiary"
        onPress={() => router.replace("/sign-in")}
      />
    </Screen>
  );
}
