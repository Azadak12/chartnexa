import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { AccessibilityInfo } from "react-native";
import type { LiveSession } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";

/** Opens the meeting in the browser. Kept separate so tests can replace it. */
export const liveOpener = {
  open: (url: string) => WebBrowser.openBrowserAsync(url),
};

const CODE_TEXT: Record<string, string> = {
  LIVE_NOT_OPEN: "This class is not open yet. Try again closer to the start.",
  LIVE_ENDED: "This class has ended.",
  LIVE_CANCELLED: "This class was cancelled.",
};

/** Asks for a fresh join link and opens it; on refusal, says why and reloads the schedule. */
export function useJoinLive(joinFn: (courseId: string, id: string) => Promise<{ url: string }>) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const join = async (s: Pick<LiveSession, "id" | "courseId">) => {
    if (busy) return;
    setBusy(s.id);
    setMessage(null);
    try {
      const { url } = await joinFn(s.courseId, s.id);
      await liveOpener.open(url);
    } catch (e) {
      const text =
        isAppError(e) && e.code && CODE_TEXT[e.code]
          ? CODE_TEXT[e.code]
          : isAppError(e) && e.kind === "forbidden"
            ? "You no longer have access to this course's live classes."
            : isAppError(e) && e.kind === "not_found"
              ? "This class is no longer available."
              : isAppError(e)
                ? e.message
                : messageFor("unknown");
      setMessage(text as string);
      AccessibilityInfo.announceForAccessibility(text as string);
      void qc.invalidateQueries({ queryKey: ["live"] });
    } finally {
      setBusy(null);
    }
  };
  return { join, busy, message };
}
