import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { isAppError, messageFor } from "../../api/errors";
import { QueryStateView } from "../../state/StateView";
import { Banner, Button, Card, Screen, Text, TextField, useSubmitOnce } from "../../ui";
import { mfaApi } from "../mfa-api";
import { RecoveryCodesView } from "./RecoveryCodesView";

/** Two-step sign-in for staff: whether it is on, and new recovery codes. */
export function ProfileTwoStepScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["mfa"], queryFn: mfaApi.status });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/profile"));

  const { run, pending } = useSubmitOnce(async () => {
    setError(null);
    try {
      setCodes(await mfaApi.regenerate({ password, code }));
      setPassword("");
      setCode("");
      void qc.invalidateQueries({ queryKey: ["mfa"] });
    } catch (e) {
      // The server names what was wrong (password or code) with a 400, so the session stays.
      setError(
        isAppError(e) && e.kind === "validation" && e.fields.length > 0
          ? e.fields.map((f) => f.message).join(" ")
          : isAppError(e)
            ? e.message
            : messageFor("unknown"),
      );
      setCode("");
    }
  });

  if (codes) {
    return (
      <Screen>
        <Text variant="title" accessibilityRole="header">
          Your new recovery codes
        </Text>
        <Text tone="muted">The old codes no longer work.</Text>
        <RecoveryCodesView codes={codes} continueLabel="Done" onContinue={back} />
      </Screen>
    );
  }
  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        Two-step sign-in
      </Text>
      <QueryStateView query={query}>
        {(s) =>
          !s.required ? (
            <Text>Two-step sign-in is not required for your account.</Text>
          ) : (
            <>
              <Card>
                <Text variant="subheading" testID="mfa-state">
                  Two-step sign-in: {s.enabled ? "On" : "Off"}
                </Text>
                <Text tone="muted">
                  {s.recoveryCodesRemaining} recovery{" "}
                  {s.recoveryCodesRemaining === 1 ? "code" : "codes"} left
                </Text>
              </Card>
              {s.enabled ? (
                <>
                  <Text variant="heading" accessibilityRole="header">
                    Get new recovery codes
                  </Text>
                  <Text tone="muted">
                    Enter your password and a current code from your authenticator app. Your old
                    codes will stop working.
                  </Text>
                  {error ? <Banner kind="error" message={error} testID="form-error" /> : null}
                  <TextField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="current-password"
                    textContentType="password"
                    autoCapitalize="none"
                  />
                  <TextField
                    label="Authenticator code"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={7}
                    accessibilityHint="Six digits"
                  />
                  <Button
                    label="Get new recovery codes"
                    loading={pending}
                    disabled={password.length === 0 || code.replace(/\s/g, "").length < 6}
                    onPress={() => void run()}
                  />
                </>
              ) : null}
            </>
          )
        }
      </QueryStateView>
      <Button label="Back" variant="tertiary" onPress={back} />
    </Screen>
  );
}
