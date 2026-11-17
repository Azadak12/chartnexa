import { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";

/** How long the splash screen waits for Inter before the app starts with the system font. */
export const FONT_TIMEOUT_MS = 3000;

/** The only weights the app uses; keeping the list small keeps the app size down. */
export const INTER_WEIGHTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} as const;

/**
 * Returns true when the app may render: Inter finished loading, failed to load, or the
 * timeout passed. Text always asks for Inter, and the platform falls back to the system
 * font for any family that is not available, so a slow or failed load never blocks the app.
 */
export function useAppFonts(timeoutMs: number = FONT_TIMEOUT_MS): boolean {
  const [loaded, error] = useFonts(INTER_WEIGHTS);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [timeoutMs]);
  return loaded || error != null || timedOut;
}
