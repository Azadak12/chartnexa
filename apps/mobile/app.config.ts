import type { ExpoConfig } from "expo/config";

// Placeholder identifiers until the final brand and publisher accounts exist (decision Q12).
const config: ExpoConfig = {
  name: "ChartNexa Academy",
  slug: "chartnexa",
  scheme: "chartnexa",
  version: "0.0.0",
  orientation: "default",
  userInterfaceStyle: "light",
  platforms: ["ios", "android"],
  ios: { bundleIdentifier: "com.chartnexa.academy", supportsTablet: true },
  android: { package: "com.chartnexa.academy" },
  plugins: ["expo-router", "expo-font", "expo-status-bar", "expo-splash-screen"],
  // Public values only. Nothing secret may be placed in the app.
  extra: { apiBaseUrl: process.env["EXPO_PUBLIC_API_BASE_URL"] ?? "http://localhost:3000" },
};

export default config;
