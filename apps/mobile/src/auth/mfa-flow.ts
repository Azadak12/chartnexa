import { useSyncExternalStore } from "react";
import type { MfaChallenge, TokenPair } from "@chartnexa/api-contracts";

/**
 * Where a two-step sign-in stands. Held in memory only, never on disk and never in a link: the
 * challenge token and any recovery codes disappear when the app closes or the flow ends.
 */
export interface MfaFlow {
  email: string;
  challenge: MfaChallenge;
  /** Local time the challenge stops working. */
  expiresAt: number;
  /** After the second step, kept until the person has seen what they need to see. */
  done?: { pair: TokenPair; recoveryCodes?: string[]; recoveryCodesRemaining?: number | null };
}

let flow: MfaFlow | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const mfaFlow = {
  get: (): MfaFlow | null => flow,
  start(email: string, challenge: MfaChallenge): void {
    flow = { email, challenge, expiresAt: Date.now() + challenge.expiresInSeconds * 1000 };
    emit();
  },
  finish(done: NonNullable<MfaFlow["done"]>): void {
    if (flow) flow = { ...flow, done };
    emit();
  },
  clear(): void {
    flow = null;
    emit();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useMfaFlow(): MfaFlow | null {
  return useSyncExternalStore(mfaFlow.subscribe, mfaFlow.get, mfaFlow.get);
}
