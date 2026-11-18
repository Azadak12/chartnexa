import { useRouter } from "expo-router";
import { useEffect } from "react";
import { HOME_ROUTE, sanitizeReturnTo } from "../navigation/return-to";
import { useSession } from "../session/session-store";
import { mfaFlow } from "./mfa-flow";

/** Once the session exists, leave the two-step screens for where the person was headed. */
export function useFinishSignIn(returnTo: string | undefined): void {
  const router = useRouter();
  const { status } = useSession();
  useEffect(() => {
    if (status === "signed-in") {
      mfaFlow.clear();
      router.replace((sanitizeReturnTo(returnTo) ?? HOME_ROUTE) as never);
    }
  }, [status, returnTo, router]);
}
