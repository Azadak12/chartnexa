import { Redirect, Stack, useSegments } from "expo-router";
import { HOME_ROUTE } from "../../src/navigation/return-to";
import { useSession } from "../../src/session/session-store";

/**
 * Public screens (welcome, sign in, create account, forgot password). A signed-in person is sent
 * Home, except on the sign-in screen itself, which sends them to wherever they were headed.
 */
export default function PublicLayout() {
  const { status } = useSession();
  const segments = useSegments();
  const onSignIn = segments[segments.length - 1] === "sign-in";
  if (status === "restoring") return null;
  if (status === "signed-in" && !onSignIn) return <Redirect href={HOME_ROUTE} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
