/**
 * Where live classes are hosted (Q03, not chosen). The one adapter, "manual", keeps the meeting
 * link that staff paste from any service. A hosted provider would create the room here instead
 * and hand back a per-person link.
 */
export interface LiveProvider {
  readonly name: string;
  /** Checks and normalises the link staff entered. Returns null when the link is not acceptable. */
  acceptLink(url: string): string | null;
  /** The link one person uses to join. */
  joinLinkFor(stored: { joinUrl: string }, userId: string): string;
}

export const LIVE_PROVIDER = Symbol("LIVE_PROVIDER");

export class ManualLinkProvider implements LiveProvider {
  readonly name = "manual";

  acceptLink(url: string): string | null {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    // Links with credentials in them would leak a password to every student.
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  }

  joinLinkFor(stored: { joinUrl: string }): string {
    return stored.joinUrl;
  }
}
