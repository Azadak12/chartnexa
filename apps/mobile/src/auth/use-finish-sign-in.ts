import { useEffect } from "react";
import { useSession } from "../session/session-store";
import { mfaFlow } from "./mfa-flow";

/**
 * Once the session exists, forget the two-step state. AuthGate then moves the person on, to where
 * they were headed or to their role's landing page.
 */
export function useFinishSignIn(): void {
  const { status } = useSession();
  useEffect(() => {
    if (status === "signed-in") mfaFlow.clear();
  }, [status]);
}
