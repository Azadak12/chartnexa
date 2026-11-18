import type { MfaChallenge } from "@chartnexa/api-contracts";
import type { RequestCtx } from "./http/request-context.js";

/** Injection token for the second sign-in step. The MFA module provides it. */
export const MFA_GATE = Symbol("MFA_GATE");

/**
 * Asked after a correct password. Returns a challenge when the person must pass a second step
 * before any session exists, or null when a normal sign-in is fine.
 */
export interface MfaGate {
  challengeFor(userId: string, ctx: RequestCtx): Promise<MfaChallenge | null>;
}
