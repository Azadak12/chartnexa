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
  // The two-step screens finish a sign-in, so they too decide where the person goes next.
  const last = segments[segments.length - 1];
  const onSignIn =
    last === "sign-in" ||
    last === "two-step" ||
    last === "two-step-setup" ||
    last === "recovery-codes";
  if (status === "restoring") return null;
  if (status === "signed-in" && !onSignIn) return <Redirect href={HOME_ROUTE} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
