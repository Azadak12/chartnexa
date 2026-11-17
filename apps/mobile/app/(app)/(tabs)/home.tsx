import { Screen, Text } from "../../../src/ui";
import { StateView } from "../../../src/state/StateView";

export default function Home() {
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Home
      </Text>
      <StateView
        state="empty"
        title="Courses are coming soon"
        message="The course catalog will appear here."
      />
    </Screen>
  );
}
