import { Redirect } from "expo-router";
import { GateLoading, useLanding } from "../src/navigation/AuthGate";
import { useSession } from "../src/session/session-store";

/** The root decides once: Sign In when signed out, otherwise the role's landing page. */
export default function Index() {
  const { status } = useSession();
  const signedIn = status === "signed-in";
  const landing = useLanding(signedIn);
  if (status === "restoring") return <GateLoading />;
  if (!signedIn) return <Redirect href="/sign-in" />;
  if (!landing.ready) return <GateLoading />;
  return <Redirect href={landing.href as never} />;
}
