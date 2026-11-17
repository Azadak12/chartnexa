import * as SecureStore from "expo-secure-store";
import { z } from "zod";

/**
 * The refresh token is the only credential that survives a restart, so it lives only in the
 * device's secure storage (iOS Keychain, Android Keystore). The access token is never stored.
 * The key is versioned so a future format change can migrate or discard old values.
 */
const KEY = "chartnexa.session.v1";

const stored = z.object({ refreshToken: z.string().min(16), sessionId: z.string().min(1) });
export type StoredSession = z.infer<typeof stored>;

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const tokenStore = {
  async save(session: StoredSession): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session), OPTIONS);
  },

  /** Returns null when nothing is stored or the stored value is damaged (which is then removed). */
  async load(): Promise<StoredSession | null> {
    let raw: string | null;
    try {
      raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = stored.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // fall through: damaged value
    }
    await tokenStore.clear();
    return null;
  },

  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEY, OPTIONS);
    } catch {
      // Nothing more can be done; the in-memory session is cleared by the caller regardless.
    }
  },
};
