import { useRouter } from "expo-router";
import { demoAccountsEnabled } from "../../src/dev/demo-accounts";
import { useSession } from "../../src/session/session-store";
import { TestServerSection } from "../../src/api/TestServerSheet";
import { Banner, Button, Screen, Text } from "../../src/ui";

export default function Welcome() {
  const router = useRouter();
  const { notice } = useSession();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        ChartNexa Academy
      </Text>
      <Text tone="muted">Learn the Market. Master the Skills.</Text>
      {notice ? <Banner kind="info" message={notice} testID="session-notice" /> : null}
      <Button label="Sign in" onPress={() => router.push("/sign-in")} />
      <Button label="Create account" variant="secondary" onPress={() => router.push("/register")} />
      <Button
        label="I have an invitation"
        variant="tertiary"
        onPress={() => router.push("/accept-invitation")}
      />
      {demoAccountsEnabled() ? (
        <Button
          label="Demo accounts"
          variant="secondary"
          accessibilityHint="Testing only: choose a demo role to sign in as"
          onPress={() => router.push("/demo-accounts")}
        />
      ) : null}
      <TestServerSection />
    </Screen>
  );
}
