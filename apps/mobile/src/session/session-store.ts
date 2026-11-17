import { useSyncExternalStore } from "react";
import { clearScreenMemory } from "../navigation/screen-memory";

/** `restoring` lasts only while the app checks for a stored session at launch. */
export type SessionStatus = "restoring" | "signed-out" | "signed-in";

type Listener = () => void;

let status: SessionStatus = "restoring";
let notice: string | null = null;
const listeners = new Set<Listener>();
let snapshot: { status: SessionStatus; notice: string | null } = { status, notice };

function emit(): void {
  snapshot = { status, notice };
  listeners.forEach((l) => l());
}

/**
 * The single place that knows whether someone is signed in. Only the session manager sets it
 * in the real app; tests drive it directly. Signing out clears remembered screen state so one
 * person's scroll position and filters never reach the next.
 */
export const sessionStore = {
  get: (): SessionStatus => status,
  getSnapshot: () => snapshot,
  set(next: SessionStatus): void {
    if (next === status) return;
    status = next;
    if (next === "signed-out") clearScreenMemory();
    emit();
  },
  /** A message for the next signed-out screen (for example "Your session ended"). */
  setNotice(message: string | null): void {
    notice = message;
    emit();
  },
  /** Ends the session on the device: the sign-in screen is shown and the person returns afterward. */
  expire(): void {
    sessionStore.set("signed-out");
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSession(): {
  status: SessionStatus;
  notice: string | null;
  expire: () => void;
  clearNotice: () => void;
} {
  const s = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getSnapshot,
  );
  return {
    status: s.status,
    notice: s.notice,
    expire: sessionStore.expire,
    clearNotice: () => sessionStore.setNotice(null),
  };
}
