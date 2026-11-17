import * as SecureStore from "expo-secure-store";
import { tokenStore } from "../src/auth/token-store";

const mock = SecureStore as unknown as {
  __dump: () => Record<string, string>;
  __reset: () => void;
};

beforeEach(() => mock.__reset());

describe("token store", () => {
  it("writes only the refresh token and session id, in secure storage with the strict setting", async () => {
    await tokenStore.save({ refreshToken: "r".repeat(32), sessionId: "s-1" });
    const dump = mock.__dump();
    expect(Object.keys(dump)).toEqual(["chartnexa.session.v1"]);
    expect(JSON.parse(dump["chartnexa.session.v1"] as string)).toEqual({
      refreshToken: "r".repeat(32),
      sessionId: "s-1",
    });
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
      "chartnexa.session.v1",
      expect.any(String),
      expect.objectContaining({ keychainAccessible: "WHEN_UNLOCKED_THIS_DEVICE_ONLY" }),
    );
  });

  it("loads what was saved and deletes it on clear", async () => {
    await tokenStore.save({ refreshToken: "r".repeat(32), sessionId: "s-1" });
    expect(await tokenStore.load()).toEqual({ refreshToken: "r".repeat(32), sessionId: "s-1" });
    await tokenStore.clear();
    expect(mock.__dump()).toEqual({});
    expect(await tokenStore.load()).toBeNull();
  });

  it("treats a damaged stored value as no session and removes it", async () => {
    await SecureStore.setItemAsync("chartnexa.session.v1", "not json{");
    expect(await tokenStore.load()).toBeNull();
    expect(mock.__dump()).toEqual({});
    await SecureStore.setItemAsync("chartnexa.session.v1", JSON.stringify({ refreshToken: "x" }));
    expect(await tokenStore.load()).toBeNull();
    expect(mock.__dump()).toEqual({});
  });

  it("returns null instead of throwing when storage cannot be read", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error("keystore locked"));
    expect(await tokenStore.load()).toBeNull();
  });
});
