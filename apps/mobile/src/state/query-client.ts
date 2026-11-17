import NetInfo from "@react-native-community/netinfo";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { isAppError } from "../api/errors";

/** Retry only failures that may pass on their own; never retry a 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isAppError(error)) return false;
  return error.kind === "network" || error.kind === "server" || error.kind === "unavailable";
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}

/** Tells TanStack Query when the device is online so it pauses and resumes requests. */
export function connectOnlineManager(): () => void {
  onlineManager.setEventListener((setOnline) => {
    const unsubscribe = NetInfo.addEventListener((s) => setOnline(s.isConnected !== false));
    return unsubscribe;
  });
  return () => undefined;
}
