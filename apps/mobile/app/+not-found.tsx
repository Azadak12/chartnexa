import { useRouter } from "expo-router";
import { Screen } from "../src/ui";
import { StateView } from "../src/state/StateView";

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <StateView
        state="empty"
        title="Page not found"
        message="That page does not exist or has moved."
        actionLabel="Go to Home"
        onAction={() => router.replace("/")}
      />
    </Screen>
  );
}
