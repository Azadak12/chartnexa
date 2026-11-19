import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Dimensions, StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";

const app = "./app";
const ENV = process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"];

beforeEach(() => {
  jest.restoreAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"] = "true";
});
afterAll(() => {
  if (ENV === undefined) delete process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"];
  else process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"] = ENV;
});

describe("the sign-in design", () => {
  it("shows the brand, a large welcome, a short line, a decorative chart marked simulated, and inline fields", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeTruthy();
    expect(screen.getByText("Learn trading with confidence, step by step.")).toBeTruthy();
    expect(screen.getByTestId("auth-brand")).toBeTruthy();
    // The chart is decoration: hidden from screen readers, and never shows a price or percentage.
    expect(screen.getByTestId("auth-hero", { hidden: true })).toBeTruthy();
    expect(screen.queryByTestId("auth-hero")).toBeNull();
    expect(screen.getByText("Simulated", { hidden: true })).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
    // Fields keep their spoken names but show the design's placeholders.
    expect(screen.getByLabelText("Email").props.placeholder).toBe("Email address");
    expect(screen.getByLabelText("Password").props.placeholder).toBe("Password");
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("offers no social sign-in that does not exist", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByText(/google/i)).toBeNull();
    expect(screen.queryByText(/or continue with/i)).toBeNull();
  });

  it("leads to Create account and Forgot password", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    await fireEvent.press(await screen.findByRole("button", { name: "Forgot password?" }));
    expect(screen).toHavePathname("/forgot-password");
    await screen.unmount();
    await renderRouter(app, { initialUrl: "/sign-in" });
    await fireEvent.press(await screen.findByRole("button", { name: "Create account" }));
    expect(screen).toHavePathname("/register");
  });

  it("shows the demo-account card only where demo accounts are on, and it opens the hub", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    await fireEvent.press(await screen.findByRole("button", { name: "Try a demo account" }));
    expect(screen).toHavePathname("/demo-accounts");
    await screen.unmount();
    process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"] = "false";
    await renderRouter(app, { initialUrl: "/sign-in" });
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: "Try a demo account" })).toBeNull();
  });

  it.each([320, 360, 430])(
    "keeps the text column flexible and the chart card within its share at %idp",
    async (w) => {
      jest
        .spyOn(Dimensions, "get")
        .mockReturnValue({ width: w, height: 800, scale: 2, fontScale: 1 });
      await renderRouter(app, { initialUrl: "/sign-in" });
      const hero = StyleSheet.flatten(
        (await screen.findByTestId("auth-hero", { hidden: true })).props.style,
      );
      expect(hero.width).toBeLessThanOrEqual(Math.round(w * 0.42) + 1);
      expect(hero.width).toBeGreaterThanOrEqual(120);
      const title = screen.getByTestId("auth-title");
      expect(title.props.accessibilityRole).toBe("header");
    },
  );
});

describe("the sign-up design", () => {
  it("shows the title, inline fields with icons' placeholders, Sign up and the sign-in link", async () => {
    await renderRouter(app, { initialUrl: "/register" });
    expect(await screen.findByRole("header", { name: "Create your account" })).toBeTruthy();
    expect(screen.getByLabelText("Name (optional)").props.placeholder).toBe("Full name");
    expect(screen.getByLabelText("Email").props.placeholder).toBe("Email address");
    expect(screen.getByLabelText("Password").props.placeholder).toBe("Password");
    expect(screen.getByLabelText("Confirm password").props.placeholder).toBe("Confirm password");
    expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();
    expect(screen.getByTestId("register-tagline")).toBeTruthy();
    // No terms checkbox: there are no published terms or consent field to attach it to.
    expect(screen.queryByRole("checkbox")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(screen).toHavePathname("/sign-in");
  });

  it("still refuses a mismatched confirmation and shows the error beside the field", async () => {
    await renderRouter(app, { initialUrl: "/register" });
    await fireEvent.changeText(await screen.findByLabelText("Email"), "a@b.co");
    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse battery");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "different one here");
    await fireEvent.press(screen.getByRole("button", { name: "Sign up" }));
    expect((await screen.findAllByTestId("field-error")).length).toBeGreaterThan(0);
  });
});
