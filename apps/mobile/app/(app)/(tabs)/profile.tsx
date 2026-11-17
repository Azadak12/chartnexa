import { useSession } from "../../../src/session/session-store";
import { Button, Screen, Text } from "../../../src/ui";

export default function Profile() {
  const { expire } = useSession();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Profile
      </Text>
      <Button label="Sign out" variant="secondary" onPress={expire} />
    </Screen>
  );
}
