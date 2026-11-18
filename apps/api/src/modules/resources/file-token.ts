import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived signed permission to read one file: resource id, the person (or "public" for a
 * free preview), whether it is a download, and the expiry, signed with a key derived from the
 * access-token secret. It travels as a query value, so request logs never show it.
 */
export interface FileGrant {
  resourceId: string;
  subject: string;
  download: boolean;
  expiresAt: number;
}

const keyOf = (secret: string) =>
  createHmac("sha256", secret).update("chartnexa:file-links").digest();

export function signFileGrant(g: FileGrant, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify([g.resourceId, g.subject, g.download ? 1 : 0, g.expiresAt]),
  ).toString("base64url");
  const mac = createHmac("sha256", keyOf(secret)).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

/** The grant if the signature is valid, it is for this resource and it has not expired. */
export function verifyFileGrant(
  token: string,
  resourceId: string,
  secret: string,
  now = Date.now(),
): FileGrant | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac || token.length > 600) return null;
  const want = createHmac("sha256", keyOf(secret)).update(payload).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const [id, subject, download, exp] = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (id !== resourceId || typeof exp !== "number" || exp < now) return null;
    return { resourceId: id, subject: String(subject), download: download === 1, expiresAt: exp };
  } catch {
    return null;
  }
}
