import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Screen, Text } from "../../../../src/ui";

/** Placeholder detail screen; it exercises route parameters, back behavior and return-to. */
export default function CourseDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Course {id}
      </Text>
      <Text tone="muted">Course details will appear here.</Text>
      <Button
        label="Back"
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
      />
    </Screen>
  );
}
