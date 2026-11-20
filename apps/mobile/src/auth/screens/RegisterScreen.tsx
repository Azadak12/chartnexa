import { useRouter } from "expo-router";
import { useState } from "react";
import { applyServerErrors, registerFormSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { colors, radii, spacing } from "../../theme";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { AuthLayout } from "../AuthLayout";
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
    <AuthLayout
      title="Create your account"
      subtitle="Start your trading-learning journey with ChartNexa Academy."
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
            <Text tone="muted">Already have an account?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              onPress={() => router.replace("/sign-in")}
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text variant="bodyStrong" tone="link">
                Sign in
              </Text>
            </Pressable>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radii.card,
              backgroundColor: colors.blueTint,
            }}
            testID="register-tagline"
          >
            <View
              accessible={false}
              style={{
                width: 48,
                height: 48,
                borderRadius: radii.control,
                backgroundColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="book-open" size={24} color={colors.blue} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong" tone="link">
                Learn. Practice. Build confidence.
              </Text>
              <Text variant="caption" tone="muted">
                Expert-led courses and practice on simulated charts.
              </Text>
            </View>
          </View>
        </View>
      }
    >
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      <FormField
        control={control}
        name="displayName"
        label="Name (optional)"
        placeholder="Full name"
        icon="user"
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
      />
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
        password="new-password"
      />
      <FormField
        control={control}
        name="confirmPassword"
        label="Confirm password"
        icon="lock"
        password="new-password"
      />
      <Text variant="caption" tone="muted">
        Use at least 10 characters. Avoid common passwords and your email.
      </Text>
      <Button
        label="Sign up"
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v as never))()}
      />
    </AuthLayout>
  );
}
