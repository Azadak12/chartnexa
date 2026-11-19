import type { ExpoConfig } from "expo/config";

/**
 * One app, three variants, chosen by APP_VARIANT (set per build profile in eas.json):
 * - development: dev client, loads JavaScript from a computer on the same network.
 * - preview: installable test build (APK / ad hoc) against a development or staging API.
 * - production: store build. Refuses anything that only makes sense in testing.
 * Each variant has its own app id and link scheme, so test builds install beside each other and
 * email links open the build they were meant for. The production iOS id is the one registered in
 * App Store Connect (com.chartnexa.academy); the Apple team and app ids used for upload are in
 * eas.json under submit.
 */
export type Variant = "development" | "preview" | "production";

const VARIANTS: Record<Variant, { name: string; suffix: string; scheme: string }> = {
  development: { name: "ChartNexa (Dev)", suffix: ".dev", scheme: "chartnexa-dev" },
  preview: { name: "ChartNexa (Preview)", suffix: ".preview", scheme: "chartnexa-preview" },
  production: { name: "ChartNexa Academy", suffix: "", scheme: "chartnexa" },
};

/** Hosts that only exist on a developer's machine or local network. */
const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/i;

export class AppConfigError extends Error {}

function apiUrlFor(variant: Variant, raw: string | undefined): string {
  if (!raw) {
    if (variant === "development") return "http://localhost:3000";
    throw new AppConfigError(
      `EXPO_PUBLIC_API_BASE_URL is required for ${variant} builds (the API address the phone uses)`,
    );
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new AppConfigError("EXPO_PUBLIC_API_BASE_URL is not a valid address");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new AppConfigError("EXPO_PUBLIC_API_BASE_URL must start with http:// or https://");
  }
  if (u.username || u.password || u.search || u.hash) {
    throw new AppConfigError(
      "EXPO_PUBLIC_API_BASE_URL must not contain credentials, a query or a fragment",
    );
  }
  if (variant === "production" && (u.protocol !== "https:" || LOCAL_HOST.test(u.hostname))) {
    throw new AppConfigError(
      "production builds need an https API on a public host, never localhost or a local network address",
    );
  }
  return raw.replace(/\/+$/, "");
}

export function buildConfig(env: Record<string, string | undefined>): ExpoConfig {
  const raw = env["APP_VARIANT"] ?? "development";
  if (!(raw in VARIANTS)) {
    throw new AppConfigError("APP_VARIANT must be development, preview or production");
  }
  const variant = raw as Variant;
  const v = VARIANTS[variant];
  const apiBaseUrl = apiUrlFor(variant, env["EXPO_PUBLIC_API_BASE_URL"]);
  const testing = variant !== "production";
  const projectId = env["EAS_PROJECT_ID"];
  const appId = `com.chartnexa.academy${v.suffix}`;

  return {
    name: v.name,
    slug: "chartnexa",
    scheme: v.scheme,
    version: "0.1.0",
    orientation: "default",
    userInterfaceStyle: "light",
    // 1024x1024, no transparency (App Store requirement). Made by scripts/make-icons.py.
    icon: "./assets/icon.png",
    platforms: ["ios", "android"],
    ios: {
      bundleIdentifier: appId,
      supportsTablet: true,
      infoPlist: {
        // Test builds may reach a computer on the local network over plain HTTP (App Transport
        // Security allows local addresses with this key); production builds never get it.
        ...(testing
          ? {
              NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
              NSLocalNetworkUsageDescription:
                "This test build connects to a ChartNexa server on your local network.",
            }
          : {}),
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: appId,
      // The app needs network access only; no camera, microphone, location or contacts.
      permissions: ["android.permission.INTERNET"],
      blockedPermissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-status-bar",
      [
        "expo-splash-screen",
        { image: "./assets/splash-icon.png", imageWidth: 160, backgroundColor: "#FFFFFF" },
      ],
      "expo-secure-store",
      "expo-video",
      [
        "expo-build-properties",
        // Plain HTTP only for test builds, so a phone can reach a development computer.
        { android: { usesCleartextTraffic: testing } },
      ],
    ],
    // Public values only. Nothing secret may be placed in the app.
    extra: {
      apiBaseUrl,
      variant,
      ...(projectId ? { eas: { projectId } } : {}),
    },
    ...(projectId ? { updates: { enabled: false }, runtimeVersion: { policy: "appVersion" } } : {}),
  };
}

export default (): ExpoConfig => buildConfig(process.env);
