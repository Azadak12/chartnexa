import { useQuery } from "@tanstack/react-query";
import { useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { fetchAccess } from "../courses/course-api";
import { sessionStore, useSession } from "../session/session-store";
import { colors } from "../theme";
import { landingFor } from "./landing";
import { buildReturnTo, sanitizeReturnTo } from "./return-to";

/** The only thing shown while the app decides where someone belongs: a plain spinner on white. */
export function GateLoading() {
  return (
    <View
      testID="gate-loading"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.white,
      }}
    >
      <ActivityIndicator color={colors.blue} />
    </View>
  );
}

/** Covers whatever is on screen while a move is pending, so a protected screen is never seen. */
function GateOverlay() {
  return (
    <View
      testID="gate-overlay"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: colors.white,
      }}
    >
      <GateLoading />
    </View>
  );
}

/** The role's landing page, once the server has said who the person is. */
export function useLanding(enabled: boolean): { ready: boolean; href: string } {
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess, enabled, retry: false });
  const ready = !enabled || access.status !== "pending";
  // If the role cannot be read, start at Student Home; the server still checks every request.
  return { ready, href: landingFor(access.data) };
}

/**
 * The one authentication guard for the whole app (the screens carry no checks of their own).
 *  - Signed out on a protected screen (a tab, a course, a deep link): to Sign In, remembering
 *    the place so signing in returns there. The signed-in screens unmount, so Back cannot reach
 *    them again.
 *  - Signed in on a sign-in or sign-up screen: to where they were headed, or their role's landing.
 * The root `/` and the neutral screens (verify email, reset password, invitations) pass through.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  const signedIn = status === "signed-in";
  const group = segments[0] as string | undefined;
  const landing = useLanding(signedIn && group === "(public)");
  const lastSignedInHref = useRef<string | null>(null);

  // Path segments like [id] also appear in the parameters; only the real query is kept.
  const dynamic = new Set(
    segments.flatMap((s) => {
      const m = /^\[(?:\.\.\.)?(.+)\]$/.exec(s);
      return m ? [m[1] as string] : [];
    }),
  );
  const query = Object.fromEntries(Object.entries(params).filter(([k]) => !dynamic.has(k)));
  const here = buildReturnTo(pathname, query);

  if (signedIn && group === "(app)") lastSignedInHref.current = here;

  // Decide, then act in an effect: the navigator below stays mounted, so the move is a normal
  // `replace` that drops the screen it leaves from the history.
  let target: string | null = null;
  let blocked = false;
  if (!signedIn && group === "(app)") {
    // When a session ends mid-use the router is already unwinding, so the last place seen while
    // signed in is the reliable one. A signed-out deep link has no earlier place.
    // Signing out on purpose forgets the place, so whoever signs in next starts at their own
    // landing page. Only an expired or rejected session returns to where the person was.
    const wasSignedIn = lastSignedInHref.current !== null;
    const returnTo = wasSignedIn ? lastSignedInHref.current : here;
    const forget = wasSignedIn && sessionStore.getEndedBy() === "signout";
    target = forget ? "/sign-in" : `/sign-in?returnTo=${encodeURIComponent(returnTo ?? here)}`;
    blocked = true;
  } else if (signedIn && group === "(public)") {
    blocked = true;
    if (landing.ready) target = sanitizeReturnTo(params["returnTo"]) ?? landing.href;
  }
  useEffect(() => {
    if (target) router.replace(target as never);
  }, [target, router]);

  return (
    <>
      {children}
      {blocked ? <GateOverlay /> : null}
    </>
  );
}
