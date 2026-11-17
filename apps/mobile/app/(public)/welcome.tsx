import { useRouter } from "expo-router";
import { View } from "react-native";
import { useSession } from "../../src/session/session-store";
import { Banner, Button, Screen, Text } from "../../src/ui";

export default function Welcome() {
  const router = useRouter();
  const { notice } = useSession();
  return (
    <Screen narrow hero>
      <View style={{ gap: 8, alignItems: "center" }}>
        <Text variant="title" accessibilityRole="header" style={{ textAlign: "center" }}>
          ChartNexa Academy
        </Text>
        <Text tone="muted" style={{ textAlign: "center" }}>
          Learn the Market. Master the Skills.
        </Text>
      </View>
      {notice ? <Banner kind="info" message={notice} testID="session-notice" /> : null}
      <View style={{ gap: 12 }}>
        <Button label="Sign in" onPress={() => router.push("/sign-in")} />
        <Button
          label="Create account"
          variant="secondary"
          onPress={() => router.push("/register")}
        />
      </View>
    </Screen>
  );
}
