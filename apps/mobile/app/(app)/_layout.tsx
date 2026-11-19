import { Stack } from "expo-router";

/** Signed-in screens. AuthGate (in the root layout) keeps signed-out people out. */
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
