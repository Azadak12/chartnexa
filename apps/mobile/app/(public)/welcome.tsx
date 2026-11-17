import { useRouter } from "expo-router";
import { Button, Screen, Text } from "../../src/ui";

export default function Welcome() {
  const router = useRouter();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        ChartNexa Academy
      </Text>
      <Text tone="muted">Learn the Market. Master the Skills.</Text>
      <Button label="Sign in" onPress={() => router.push("/sign-in")} />
    </Screen>
  );
}
