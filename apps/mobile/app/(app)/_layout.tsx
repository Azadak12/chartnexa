import { Redirect, Stack, useGlobalSearchParams, usePathname, useSegments } from "expo-router";
import { useRef } from "react";
import { buildReturnTo } from "../../src/navigation/return-to";
import { useSession } from "../../src/session/session-store";

/** Signed-in area: without a session, go to sign-in and remember where the person was headed. */
export default function AppLayout() {
  const { status } = useSession();
  const pathname = usePathname();
  const segments = useSegments();
  const params = useGlobalSearchParams();
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

  if (status === "signed-in") {
    lastSignedInHref.current = here;
    return <Stack screenOptions={{ headerShown: false }} />;
  }
  // When a session ends mid-use the router state is already unwinding, so the last place seen
  // while signed in is the reliable one. A signed-out deep link has no earlier place.
  const returnTo = lastSignedInHref.current ?? here;
  return <Redirect href={{ pathname: "/sign-in", params: { returnTo } } as never} />;
}
