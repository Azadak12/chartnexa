import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { applyServerErrors, codeSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { useSession } from "../../session/session-store";
import { StateView } from "../../state/StateView";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { accountApi } from "../account-api";
import { authHttp } from "../auth-http";
import { formMessage } from "../errors-ui";
import { queryClientRef } from "../query-ref";

export const INVALID_VERIFY_MESSAGE = "This code is invalid or has expired.";

type Phase = "idle" | "verifying" | "done" | "invalid" | "failed";

/** Opened from the emailed link (`token`) or by pasting the code. Works signed in or out. */
export function VerifyEmailScreen() {
  const router = useRouter();
  const { status } = useSession();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { control, handleSubmit, setError } = useZodForm(codeSchema, { token: token ?? "" });
  const [phase, setPhase] = useState<Phase>(token ? "verifying" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const autoRan = useRef(false);

  const verify = async (code: string) => {
    setPhase("verifying");
    setMessage(null);
    try {
      await authHttp.verifyEmail(code);
      queryClientRef.current?.invalidateQueries({ queryKey: ["me"] });
      setPhase("done");
    } catch (e) {
      if (applyServerErrors(e, setError, ["token"])) setPhase("idle");
      else if (
        e &&
        typeof e === "object" &&
        "kind" in e &&
        (e as { kind: string }).kind === "validation"
      )
        setPhase("invalid");
      else {
        setMessage(formMessage(e));
        setPhase("failed");
      }
    }
  };

  // A link opens this screen with the code already filled in.
  useEffect(() => {
    if (token && !autoRan.current) {
      autoRan.current = true;
      void verify(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resend = useSubmitOnce(async () => {
    setMessage(null);
    try {
      await accountApi.resendVerification();
      setResent(true);
    } catch (e) {
      setMessage(formMessage(e));
    }
  });
  const submit = useSubmitOnce(async (v: { token: string }) => verify(v.token));

  if (phase === "verifying") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }

  if (phase === "done") {
    return (
      <Screen>
        <Text variant="title" accessibilityRole="header">
          Email verified
        </Text>
        <Banner
          kind="success"
          message="Thank you. Your email address is confirmed."
          testID="verify-done"
        />
        <Button
          label={status === "signed-in" ? "Continue" : "Sign in"}
          onPress={() => router.replace(status === "signed-in" ? "/home" : "/sign-in")}
        />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Verify your email
      </Text>
      {phase === "invalid" ? (
        <Banner kind="error" message={INVALID_VERIFY_MESSAGE} testID="bad-code" />
      ) : null}
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      {phase === "invalid" ? (
        status === "signed-in" ? (
          <Button
            label={resent ? "Email sent" : "Send me a new email"}
            loading={resend.pending}
            disabled={resent}
            variant="secondary"
            onPress={() => void resend.run()}
          />
        ) : (
          <Text tone="muted">Sign in, then request a new verification email from Profile.</Text>
        )
      ) : null}
      <FormField
        control={control}
        name="token"
        label="Code from your email"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label="Verify email"
        loading={submit.pending}
        onPress={() => void handleSubmit((v) => submit.run(v as { token: string }))()}
      />
      <Button
        label={status === "signed-in" ? "Back" : "Back to sign in"}
        variant="tertiary"
        onPress={() => router.replace(status === "signed-in" ? "/home" : "/sign-in")}
      />
    </Screen>
  );
}
