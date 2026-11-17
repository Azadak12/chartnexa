import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { HOME_ROUTE, sanitizeReturnTo } from "../../src/navigation/return-to";
import { useSession } from "../../src/session/session-store";
import { Banner, Button, Screen, Text } from "../../src/ui";

/**
 * Placeholder until `mobile-auth`. It already does the important navigation work: once a
 * session exists, the person goes back to where they were headed (or Home).
 */
export default function SignIn() {
  const router = useRouter();
  const { status } = useSession();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  useEffect(() => {
    if (status === "signed-in") router.replace((sanitizeReturnTo(returnTo) ?? HOME_ROUTE) as never);
  }, [status, returnTo, router]);

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Sign in
      </Text>
      <Banner
        kind="info"
        message="Sign-in is coming in the next update. This screen is a placeholder."
      />
      {router.canGoBack() ? (
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      ) : null}
    </Screen>
  );
}
