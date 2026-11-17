import { Screen, Text } from "../../../../src/ui";
import { StateView } from "../../../../src/state/StateView";

export default function MyCourses() {
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        My Courses
      </Text>
      <StateView
        state="empty"
        title="No courses yet"
        message="Courses you purchase will appear here."
      />
    </Screen>
  );
}
