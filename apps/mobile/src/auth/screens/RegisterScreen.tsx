import { useRouter } from "expo-router";
import { useState } from "react";
import { applyServerErrors, registerFormSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { authHttp } from "../auth-http";
import { formMessage } from "../errors-ui";

/** The server answers the same way whether or not the email exists, and so does this screen. */
export function RegisterScreen() {
  const router = useRouter();
  const { control, handleSubmit, setError } = useZodForm(registerFormSchema, {
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { run, pending } = useSubmitOnce(
    async (v: { email: string; password: string; displayName?: string | undefined }) => {
      setMessage(null);
      try {
        await authHttp.register({
          email: v.email,
          password: v.password,
          ...(v.displayName ? { displayName: v.displayName } : {}),
        });
        setDone(true);
      } catch (e) {
        if (!applyServerErrors(e, setError, ["email", "password", "displayName"]))
          setMessage(formMessage(e));
      }
    },
  );

  if (done) {
    return (
      <Screen>
        <Text variant="title" accessibilityRole="header">
          Check your email
        </Text>
        <Banner
          kind="success"
          message="If we can create an account for that address, we have sent you a message with a link to confirm it. Then sign in."
          testID="register-done"
        />
        <Button label="Go to sign in" onPress={() => router.replace("/sign-in")} />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Create account
      </Text>
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      <FormField
        control={control}
        name="displayName"
        label="Name (optional)"
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
      />
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
      <FormField control={control} name="password" label="Password" password="new-password" />
      <FormField
        control={control}
        name="confirmPassword"
        label="Confirm password"
        password="new-password"
      />
      <Text variant="caption" tone="muted">
        Use at least 10 characters. Avoid common passwords and your email.
      </Text>
      <Button
        label="Create account"
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v as never))()}
      />
      <Button
        label="I already have an account"
        variant="tertiary"
        onPress={() => router.replace("/sign-in")}
      />
    </Screen>
  );
}
