import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { spacing } from "../../theme";
import { isAppError } from "../../api/errors";
import { applyServerErrors, signInSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { useSession } from "../../session/session-store";
import { Banner, Button, Text, useSubmitOnce } from "../../ui";
import { authHttp } from "../auth-http";
import { formMessage } from "../errors-ui";
import { mfaFlow } from "../mfa-flow";
import { DemoAccountsCard } from "../../dev/DemoAccountsCard";
import { demoAccountsEnabled, demoEmailOrNull } from "../../dev/demo-accounts";
import { TestServerSection } from "../../api/TestServerSheet";
import { AuthLayout } from "../AuthLayout";
import { sessionManager } from "../session-manager";

export function SignInScreen() {
  const router = useRouter();
  const { notice } = useSession();
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
    <AuthLayout
      title="Welcome back"
      subtitle="Learn trading with confidence, step by step."
      footer={
        <View style={{ gap: spacing.lg }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <Text tone="muted">Don't have an account?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign up"
              onPress={() => router.push("/register")}
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text variant="bodyStrong" tone="link">
                Sign up
              </Text>
            </Pressable>
          </View>
          <View style={{ alignItems: "center" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="I have an invitation"
              onPress={() => router.push("/accept-invitation")}
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text variant="caption" tone="link">
                I have an instructor invitation
              </Text>
            </Pressable>
          </View>
          {demoAccountsEnabled() ? (
            <DemoAccountsCard onPress={() => router.push("/demo-accounts")} />
          ) : null}
          <TestServerSection />
        </View>
      }
    >
      {notice ? <Banner kind="info" message={notice} testID="session-notice" /> : null}
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      <FormField
        control={control}
        name="email"
        label="Email"
        placeholder="Email address"
        icon="mail"
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
        icon="lock"
        password="current-password"
        returnKeyType="go"
      />
      <View style={{ alignItems: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Forgot password?"
          onPress={() => router.push("/forgot-password")}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text variant="bodyStrong" tone="link">
            Forgot password?
          </Text>
        </Pressable>
      </View>
      <Button
        label="Sign in"
        loading={pending}
        disabled={locked}
        onPress={() => void handleSubmit((v) => run(v as { email: string; password: string }))()}
      />
    </AuthLayout>
  );
}
