import { useSyncExternalStore } from "react";
import { clearScreenMemory } from "../navigation/screen-memory";

export type SessionStatus = "signed-out" | "signed-in";

type Listener = () => void;

let status: SessionStatus = "signed-out";
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

/**
 * The single place that knows whether someone is signed in. The real app stays signed-out until
 * `mobile-auth` sets tokens here; tests drive it directly. Signing out clears remembered screen
 * state so one person's scroll position and filters never reach the next.
 */
export const sessionStore = {
  get: (): SessionStatus => status,
  set(next: SessionStatus): void {
    if (next === status) return;
    status = next;
    if (next === "signed-out") clearScreenMemory();
    emit();
  },
  /** Ends the session: the sign-in screen is shown and the person returns afterward. */
  expire(): void {
    sessionStore.set("signed-out");
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSession(): { status: SessionStatus; expire: () => void } {
  const current = useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);
  return { status: current, expire: sessionStore.expire };
}
