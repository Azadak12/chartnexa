import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { AppConfigError, buildConfig } from "../app.config";
import { apiBaseUrl } from "../src/api/client";
import { checkServerAddress, testServer } from "../src/api/test-server";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";

const secure = SecureStore as unknown as { __reset: () => void };
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0", extra: { variant: "development" } } },
}));
const extra = (Constants.expoConfig as { extra: Record<string, unknown> }).extra;

describe("build variants (app.config.ts)", () => {
  it("gives each variant its own name, app id and link scheme", () => {
    const dev = buildConfig({});
    const preview = buildConfig({
      APP_VARIANT: "preview",
      EXPO_PUBLIC_API_BASE_URL: "http://192.168.1.20:3000/",
    });
    const prod = buildConfig({
      APP_VARIANT: "production",
      EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
    });
    expect([dev.scheme, preview.scheme, prod.scheme]).toEqual([
      "chartnexa-dev",
      "chartnexa-preview",
      "chartnexa",
    ]);
    expect(preview.android?.package).toBe("com.chartnexa.academy.preview");
    expect(prod.ios?.bundleIdentifier).toBe("com.chartnexa.academy");
    expect(preview.extra?.["apiBaseUrl"]).toBe("http://192.168.1.20:3000");
    expect(dev.extra?.["apiBaseUrl"]).toBe("http://localhost:3000");
  });

  it("allows plain HTTP to a local network only in test builds", () => {
    const preview = buildConfig({
      APP_VARIANT: "preview",
      EXPO_PUBLIC_API_BASE_URL: "http://10.0.0.5:3000",
    });
    const prod = buildConfig({
      APP_VARIANT: "production",
      EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
    });
    const cleartext = (c: typeof prod) =>
      (
        c.plugins?.find((p) => Array.isArray(p) && p[0] === "expo-build-properties") as [
          string,
          { android: { usesCleartextTraffic: boolean } },
        ]
      )[1].android.usesCleartextTraffic;
    expect(cleartext(preview)).toBe(true);
    expect(cleartext(prod)).toBe(false);
    expect(preview.ios?.infoPlist?.["NSAppTransportSecurity"]).toEqual({
      NSAllowsLocalNetworking: true,
    });
    expect(prod.ios?.infoPlist?.["NSAppTransportSecurity"]).toBeUndefined();
  });

  it("refuses production builds that point at HTTP, local hosts, or nothing", () => {
    for (const url of [
      undefined,
      "http://api.example.com",
      "https://localhost:3000",
      "https://192.168.1.20",
      "https://10.1.2.3",
      "https://172.20.0.1",
      "https://mac.local",
    ]) {
      expect(() =>
        buildConfig({ APP_VARIANT: "production", EXPO_PUBLIC_API_BASE_URL: url }),
      ).toThrow(AppConfigError);
    }
  });

  it("refuses unknown variants, missing preview addresses and addresses with secrets", () => {
    expect(() => buildConfig({ APP_VARIANT: "staging" })).toThrow(AppConfigError);
    expect(() => buildConfig({ APP_VARIANT: "preview" })).toThrow(AppConfigError);
    for (const url of [
      "ftp://x.example.com",
      "https://user:pw@api.example.com",
      "https://api.example.com/?k=1",
      "not a url",
    ]) {
      expect(() => buildConfig({ APP_VARIANT: "preview", EXPO_PUBLIC_API_BASE_URL: url })).toThrow(
        AppConfigError,
      );
    }
  });

  it("asks only for network access on Android", () => {
    const c = buildConfig({
      APP_VARIANT: "preview",
      EXPO_PUBLIC_API_BASE_URL: "http://10.0.0.5:3000",
    });
    expect(c.android?.permissions).toEqual(["android.permission.INTERNET"]);
    expect(c.android?.blockedPermissions).toContain("android.permission.RECORD_AUDIO");
  });
});

describe("test server setting", () => {
  beforeEach(async () => {
    secure.__reset();
    extra["variant"] = "preview";
    await testServer.reset();
  });
  afterAll(() => {
    extra["variant"] = "development";
  });

  it("cleans and checks addresses", () => {
    expect(checkServerAddress(" http://192.168.1.20:3000/ ")).toEqual({
      url: "http://192.168.1.20:3000",
    });
    expect(checkServerAddress("192.168.1.20")).toHaveProperty("error");
    expect(checkServerAddress("ftp://x.example.com")).toHaveProperty("error");
    expect(checkServerAddress("https://u:p@x.example.com")).toHaveProperty("error");
  });

  it("overrides the address in test builds and survives a restart", async () => {
    await testServer.save("http://192.168.1.20:3000");
    expect(apiBaseUrl()).toBe("http://192.168.1.20:3000");
    testServer._set(null);
    await testServer.load();
    expect(apiBaseUrl()).toBe("http://192.168.1.20:3000");
    await testServer.reset();
    expect(apiBaseUrl()).not.toBe("http://192.168.1.20:3000");
  });

  it("is ignored entirely in production builds", async () => {
    await testServer.save("http://192.168.1.20:3000");
    extra["variant"] = "production";
    expect(testServer.allowed()).toBe(false);
    expect(apiBaseUrl()).not.toBe("http://192.168.1.20:3000");
    testServer._set(null);
    await testServer.load();
    expect(testServer.current()).toBeNull();
  });

  it("is offered on Welcome in test builds, checks the server, and is hidden in production", async () => {
    sessionManager._resetForTests();
    sessionStore.set("signed-out");
    const fetchMock = jest
      .spyOn(globalThis, "fetch" as never)
      .mockResolvedValue({ ok: true, status: 200 } as never);
    await renderRouter("./app", { initialUrl: "/welcome" });
    expect(await screen.findByTestId("build-label")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Change the test server address" }));
    await fireEvent.changeText(
      screen.getByLabelText("Server address", { includeHiddenElements: true }),
      "10.0.0.5:3000",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Check and save", includeHiddenElements: true }),
    );
    expect(
      await screen.findByText(/Enter a full address/, { includeHiddenElements: true }),
    ).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText("Server address", { includeHiddenElements: true }),
      "http://10.0.0.5:3000",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Check and save", includeHiddenElements: true }),
    );
    await waitFor(() => expect(apiBaseUrl()).toBe("http://10.0.0.5:3000"));
    expect(fetchMock).toHaveBeenCalledWith("http://10.0.0.5:3000/health/ready", expect.anything());
    fetchMock.mockRestore();
    await screen.unmount();
    extra["variant"] = "production";
    await renderRouter("./app", { initialUrl: "/welcome" });
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByTestId("build-label")).toBeNull();
  });
});
