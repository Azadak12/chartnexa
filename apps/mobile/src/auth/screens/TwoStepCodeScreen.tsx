import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import type { TokenPair } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { spacing } from "../../theme";
import { Banner, Button, Screen, Text, TextField, useSubmitOnce } from "../../ui";
import { authHttp } from "../auth-http";
import { mfaFlow, useMfaFlow } from "../mfa-flow";
import { useSession } from "../../session/session-store";
import { sessionManager } from "../session-manager";
import { useFinishSignIn } from "../use-finish-sign-in";

const WRONG = "That code did not work. Check it and try again.";
const AGAIN = "If this keeps happening, go back and sign in again to get a new code.";

/** The second step of sign-in for Admins and Managers: an authenticator code or a recovery code. */
export function TwoStepCodeScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const flow = useMfaFlow();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [used, setUsed] = useState<{ pair: TokenPair; remaining: number } | null>(null);
  const input = useRef<{ focus?: () => void } | null>(null);
  const { status } = useSession();
  useFinishSignIn(returnTo);

  const backToSignIn = () => {
    mfaFlow.clear();
    router.replace({ pathname: "/sign-in", params: returnTo ? { returnTo } : {} } as never);
  };

  // Without a challenge there is nothing to do here (for example after the app was reopened).
  useEffect(() => {
    // Once signed in, the sign-in hook above decides where to go next.
    if (!flow && !used && status !== "signed-in") router.replace("/sign-in" as never);
  }, [flow, used, router, status]);

  const { run, pending } = useSubmitOnce(async () => {
    if (!flow) return;
    setError(null);
    if (Date.now() >= flow.expiresAt) {
      setError("This sign-in took too long. Go back and sign in again.");
      return;
    }
    try {
      const result = await authHttp.verifyMfa({
        challengeToken: flow.challenge.challengeToken,
        code,
      });
      const { recoveryCodesRemaining, ...pair } = result;
      if (recoveryCodesRemaining !== null) {
        setUsed({ pair, remaining: recoveryCodesRemaining });
        return;
      }
      await sessionManager.signIn(pair);
    } catch (e) {
      const unauthorized = isAppError(e) && e.kind === "unauthorized";
      const next = failures + 1;
      setFailures(next);
      setError(
        unauthorized
          ? next >= 3
            ? `${WRONG} ${AGAIN}`
            : WRONG
          : isAppError(e)
            ? e.message
            : messageFor("unknown"),
      );
      setCode("");
      AccessibilityInfo.announceForAccessibility("The code did not work");
      input.current?.focus?.();
    }
  });

  if (used) {
    return (
      <Screen>
        <Text variant="title" accessibilityRole="header">
          You used a recovery code
        </Text>
        <Text testID="recovery-remaining">
          {used.remaining === 0
            ? "You have no recovery codes left. Get new ones from Profile as soon as you are in."
            : `You have ${used.remaining} recovery ${used.remaining === 1 ? "code" : "codes"} left. Each works once.`}
        </Text>
        <Button label="Continue" onPress={() => void sessionManager.signIn(used.pair)} />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Two-step sign-in
      </Text>
      <Text>
        {recovery
          ? "Enter one of your recovery codes. Each code works once."
          : "Enter the 6-digit code from your authenticator app."}
      </Text>
      {error ? <Banner kind="error" message={error} testID="form-error" /> : null}
      <TextField
        label={recovery ? "Recovery code" : "Authentication code"}
        value={code}
        onChangeText={setCode}
        inputRef={input as never}
        keyboardType={recovery ? "default" : "number-pad"}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        maxLength={recovery ? 24 : 7}
        returnKeyType="go"
        onSubmitEditing={() => void run()}
        accessibilityHint={recovery ? undefined : "Six digits"}
      />
      <Button
        label="Verify"
        loading={pending}
        disabled={code.trim().length < 6}
        onPress={() => void run()}
      />
      <Button
        label={recovery ? "Use an authenticator code" : "Use a recovery code"}
        variant="tertiary"
        onPress={() => {
          setRecovery((v) => !v);
          setCode("");
          setError(null);
        }}
      />
      <Button label="Back to sign-in" variant="tertiary" onPress={backToSignIn} />
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        Signed in as {flow?.email ?? "your account"}.
      </Text>
    </Screen>
  );
}
