import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAppFonts } from "../src/fonts/use-app-fonts";
import { connectOnlineManager, createQueryClient } from "../src/state/query-client";
import { OverlayProvider } from "../src/ui";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const ready = useAppFonts();
  const [client] = useState(createQueryClient);

  useEffect(() => connectOnlineManager(), []);
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
