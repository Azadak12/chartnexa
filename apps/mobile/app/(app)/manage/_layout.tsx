import { Stack } from "expo-router";

/** Staff course management, opened from Profile. The server decides who is allowed. */
export default function ManageStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
