/**
 * Where to go after signing in. Only an internal app route is ever accepted, so a crafted link
 * cannot send someone to another site or app after they sign in.
 */
const MAX_LENGTH = 512;
const PATH_AND_QUERY = /^\/[A-Za-z0-9/_\-.~%()[\]]*(\?[A-Za-z0-9=&_\-.~%+,]*)?$/;
const PUBLIC_ROUTES = ["/sign-in", "/welcome"];

export const HOME_ROUTE = "/home";

export function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || value.includes("..")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (!PATH_AND_QUERY.test(value)) return null;
  const path = value.split("?")[0] as string;
  if (PUBLIC_ROUTES.some((r) => path === r || path.startsWith(`${r}/`))) return null;
  return value;
}

/** Builds `/path?query` from the current location so it can be remembered through sign-in. */
export function buildReturnTo(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const query = Object.entries(params)
    .flatMap(([k, v]) =>
      v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as const),
    )
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return query ? `${pathname}?${query}` : pathname;
}
