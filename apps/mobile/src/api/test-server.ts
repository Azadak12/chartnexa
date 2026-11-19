import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/**
 * Test builds only: lets a tester point the app at a server without rebuilding, for example a
 * development computer on the same Wi-Fi whose address changes. Production builds never read or
 * offer it (`allowed` is false there), so a store build always uses its built-in address.
 * The address is not secret; it is kept in secure storage only because that store already exists.
 */
const KEY = "chartnexa.test-server.v1";

export const appVariant = (): string => {
  const v = Constants.expoConfig?.extra?.["variant"];
  return typeof v === "string" ? v : "development";
};

let current: string | null = null;

/** Returns the cleaned address, or an error message for the person. */
export function checkServerAddress(input: string): { url: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { error: "Enter a full address, like http://192.168.1.20:3000" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { error: "The address must start with http:// or https://" };
  }
  if (u.username || u.password || u.search || u.hash) {
    return { error: "Leave out user names, passwords, ? and #" };
  }
  return { url: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}` };
}

export const testServer = {
  allowed: (): boolean => appVariant() !== "production",
  current: (): string | null => (testServer.allowed() ? current : null),
  async load(): Promise<void> {
    if (!testServer.allowed()) return;
    try {
      const saved = await SecureStore.getItemAsync(KEY);
      const ok = saved ? checkServerAddress(saved) : null;
      current = ok && "url" in ok ? ok.url : null;
    } catch {
      current = null;
    }
  },
  async save(url: string): Promise<void> {
    if (!testServer.allowed()) return;
    await SecureStore.setItemAsync(KEY, url);
    current = url;
  },
  async reset(): Promise<void> {
    current = null;
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      // Nothing stored.
    }
  },
  /** For tests. */
  _set(url: string | null): void {
    current = url;
  },
};
