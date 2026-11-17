import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { queryClientRef } from "../src/auth/query-ref";
import { sessionManager } from "../src/auth/session-manager";
import { useAppFonts } from "../src/fonts/use-app-fonts";
import { sessionStore, useSession } from "../src/session/session-store";
import { connectOnlineManager, createQueryClient } from "../src/state/query-client";
import { OverlayProvider } from "../src/ui";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const fontsReady = useAppFonts();
  const { status } = useSession();
  const [client] = useState(createQueryClient);
  queryClientRef.current = client;

  useEffect(() => connectOnlineManager(), []);
  // Cached account data must never outlive the session that fetched it.
  useEffect(() => {
    sessionManager.onCleared(() => client.clear());
  }, [client]);
  // Check secure storage once at launch. Tests set the state themselves and skip this.
  useEffect(() => {
    if (sessionStore.get() === "restoring") void sessionManager.restore();
  }, []);

  const ready = fontsReady && status !== "restoring";
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <OverlayProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </OverlayProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
