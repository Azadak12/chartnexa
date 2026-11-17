import { Stack } from "expo-router";

/** The Profile tab owns its stack: account, sessions and change password. */
export default function ProfileStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
