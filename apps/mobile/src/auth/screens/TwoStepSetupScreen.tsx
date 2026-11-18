import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Share, View } from "react-native";
import type { MfaSetupStartResponse } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { StateView } from "../../state/StateView";
import { spacing } from "../../theme";
import { Banner, Button, Card, Screen, Text, TextField, useSubmitOnce } from "../../ui";
import { authHttp } from "../auth-http";
import { mfaFlow, useMfaFlow } from "../mfa-flow";
import { useSession } from "../../session/session-store";
import { useFinishSignIn } from "../use-finish-sign-in";

const group = (secret: string): string => secret.replace(/(.{4})/g, "$1 ").trim();

/** First sign-in for an Admin or Manager: add the account to an authenticator app, then prove it works. */
export function TwoStepSetupScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const flow = useMfaFlow();
  const [setup, setSetup] = useState<MfaSetupStartResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const started = useRef(false);
  const { status } = useSession();
  useFinishSignIn(returnTo);

  const backToSignIn = () => {
    mfaFlow.clear();
    router.replace({ pathname: "/sign-in", params: returnTo ? { returnTo } : {} } as never);
  };

  useEffect(() => {
    if (!flow) {
      if (status !== "signed-in") router.replace("/sign-in" as never);
      return;
    }
    if (started.current) return;
    started.current = true;
    authHttp
      .startMfaSetup(flow.challenge.challengeToken)
      .then(setSetup)
      .catch((e) => setLoadError(isAppError(e) ? e.message : messageFor("unknown")));
  }, [flow, router, status]);

  const openAuthenticator = async () => {
    if (!setup) return;
    setHint(null);
    try {
      if (!(await Linking.canOpenURL(setup.otpauthUri))) throw new Error("none");
      await Linking.openURL(setup.otpauthUri);
    } catch {
      setHint("No authenticator app opened. Install one, then type the key above into it.");
    }
  };

  const { run, pending } = useSubmitOnce(async () => {
    if (!flow || !setup) return;
    setError(null);
    try {
      const done = await authHttp.completeMfaSetup({
        challengeToken: flow.challenge.challengeToken,
        code,
      });
      const { recoveryCodes, ...pair } = done;
      mfaFlow.finish({ pair, recoveryCodes });
      router.replace({
        pathname: "/recovery-codes",
        params: returnTo ? { returnTo } : {},
      } as never);
    } catch (e) {
      setError(
        isAppError(e) && e.kind === "unauthorized"
          ? "That code did not work. Make sure the app shows this account, then try the new code."
          : isAppError(e)
            ? e.message
            : messageFor("unknown"),
      );
      setCode("");
    }
  });

  if (loadError) {
    return (
      <Screen>
        <StateView
          state="error"
          message={loadError}
          onAction={backToSignIn}
          actionLabel="Back to sign-in"
        />
      </Screen>
    );
  }
  if (!setup) {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Set up two-step sign-in
      </Text>
      <Text>
        Admins and Managers sign in with a code from an authenticator app. Add this account to the
        app, then enter the first code it shows.
      </Text>
      <Card>
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="muted">
            Setup key
          </Text>
          <Text
            variant="bodyStrong"
            selectable
            testID="setup-key"
            accessibilityLabel={`Setup key: ${group(setup.secret).split("").join(" ")}`}
          >
            {group(setup.secret)}
          </Text>
        </View>
      </Card>
      <Button label="Open authenticator app" onPress={() => void openAuthenticator()} />
      <Button
        label="Copy or share key"
        variant="secondary"
        onPress={() => void Share.share({ message: setup.secret }).catch(() => undefined)}
      />
      {hint ? <Banner kind="info" message={hint} testID="setup-hint" /> : null}
      {error ? <Banner kind="error" message={error} testID="form-error" /> : null}
      <TextField
        label="First code from the app"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={7}
        returnKeyType="go"
        onSubmitEditing={() => void run()}
        accessibilityHint="Six digits"
      />
      <Button
        label="Continue"
        loading={pending}
        disabled={code.replace(/\s/g, "").length < 6}
        onPress={() => void run()}
      />
      <Button label="Back to sign-in" variant="tertiary" onPress={backToSignIn} />
    </Screen>
  );
}
