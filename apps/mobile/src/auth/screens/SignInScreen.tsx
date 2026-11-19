import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { isAppError } from "../../api/errors";
import { applyServerErrors, signInSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { HOME_ROUTE, sanitizeReturnTo } from "../../navigation/return-to";
import { useSession } from "../../session/session-store";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { authHttp } from "../auth-http";
import { formMessage } from "../errors-ui";
import { mfaFlow } from "../mfa-flow";
import { demoEmailOrNull } from "../../dev/demo-accounts";
import { sessionManager } from "../session-manager";

export function SignInScreen() {
  const router = useRouter();
  const { status, notice } = useSession();
  const { returnTo, email: emailParam } = useLocalSearchParams<{
    returnTo?: string;
    email?: string;
  }>();
  const { control, handleSubmit, setError, resetField } = useZodForm(signInSchema, {
    // Only the four public demo addresses can be prefilled, and only where demo accounts are on.
    email: demoEmailOrNull(emailParam) ?? "",
    password: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Once signed in, go where the person was headed (or Home).
  useEffect(() => {
    if (status === "signed-in") router.replace((sanitizeReturnTo(returnTo) ?? HOME_ROUTE) as never);
  }, [status, returnTo, router]);

  // The button stays off until the server's wait has passed.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);
  const locked = lockedUntil > now;

  const { run, pending } = useSubmitOnce(async (values: { email: string; password: string }) => {
    setMessage(null);
    try {
      const result = await authHttp.login(values);
      if (!("accessToken" in result)) {
        // Admins and Managers go on to a second step before any session exists.
        mfaFlow.start(values.email, result);
        router.push({
          pathname: result.status === "mfa_setup_required" ? "/two-step-setup" : "/two-step",
          params: returnTo ? { returnTo } : {},
        } as never);
        return;
      }
      await sessionManager.signIn(result);
    } catch (e) {
      if (applyServerErrors(e, setError, ["email", "password"])) return;
      if (isAppError(e) && e.kind === "unauthorized") {
        setMessage("Invalid email or password.");
        resetField("password");
      } else {
        setMessage(formMessage(e));
        if (isAppError(e) && e.kind === "rate_limited" && e.retryAfterSeconds) {
          setLockedUntil(Date.now() + e.retryAfterSeconds * 1000);
          setNow(Date.now());
        }
      }
    }
  });

  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Sign in
      </Text>
      {notice ? <Banner kind="info" message={notice} testID="session-notice" /> : null}
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
      <FormField
        control={control}
        name="password"
        label="Password"
        password="current-password"
        returnKeyType="go"
      />
      <Button
        label="Sign in"
        loading={pending}
        disabled={locked}
        onPress={() => void handleSubmit((v) => run(v as { email: string; password: string }))()}
      />
      <View style={{ gap: 8 }}>
        <Button
          label="Forgot password?"
          variant="tertiary"
          onPress={() => router.push("/forgot-password")}
        />
        <Button
          label="Create account"
          variant="secondary"
          onPress={() => router.push("/register")}
        />
      </View>
    </Screen>
  );
}
