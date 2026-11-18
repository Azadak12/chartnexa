import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { ConfirmDialog } from "../ConfirmDialog";
import { Screen, Text } from "../../ui";
import { mfaFlow, useMfaFlow } from "../mfa-flow";
import { sessionManager } from "../session-manager";
import { useFinishSignIn } from "../use-finish-sign-in";
import { RecoveryCodesView } from "./RecoveryCodesView";

/** Shown once, right after enrollment. The session starts only when the person moves on. */
export function RecoveryCodesScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const flow = useMfaFlow();
  const [leaving, setLeaving] = useState(false);
  const acknowledged = useRef(false);
  useFinishSignIn(returnTo);

  const proceed = async () => {
    if (!flow?.done) return;
    acknowledged.current = true;
    await sessionManager.signIn(flow.done.pair);
  };

  // The hardware Back button before confirming asks first: the codes will not be shown again.
  // (The swipe-back gesture is switched off for this screen below.)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (acknowledged.current || !flow?.done) return false;
      setLeaving(true);
      return true;
    });
    return () => sub.remove();
  }, [flow]);

  if (!flow?.done?.recoveryCodes) return null;
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Text variant="title" accessibilityRole="header">
        Save your recovery codes
      </Text>
      <RecoveryCodesView
        codes={flow.done.recoveryCodes}
        continueLabel="Continue"
        onContinue={() => void proceed()}
      />
      <ConfirmDialog
        visible={leaving}
        title="Leave without saving?"
        message="These codes will not be shown again. Without them, a lost phone means asking an Admin to reset your sign-in."
        confirmLabel="Continue without saving"
        onCancel={() => setLeaving(false)}
        onConfirm={async () => {
          setLeaving(false);
          await proceed();
          if (!flow?.done) mfaFlow.clear();
        }}
      />
    </Screen>
  );
}
