import { Stack } from "expo-router";

/** Sign in, sign up and the password and two-step screens. AuthGate decides who may be here. */
export default function PublicLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
