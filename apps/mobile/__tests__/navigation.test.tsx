import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { router, useNavigationContainerRef } from "expo-router";
import { renderHook } from "@testing-library/react-native";
import { authedFetch } from "../src/auth/authed-fetch";
import { sessionManager } from "../src/auth/session-manager";
import { FakeApi } from "../test-utils/fake-api";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { sessionStore } from "../src/session/session-store";
import { mockBackHandler } from "../test-utils/back-handler";

const app = "./app";

beforeEach(() => {
  clearScreenMemory();
  sessionStore.set("signed-out");
});

describe("protected area and sign-in return", () => {
  it("sends a signed-out deep link to sign-in and returns to the same screen with its parameters", async () => {
    await renderRouter(app, { initialUrl: "/courses/42?tab=reviews" });
    expect(screen).toHavePathname("/sign-in");
    expect(screen).toHaveSearchParams({ returnTo: "/courses/42?tab=reviews" });
    expect(screen.getByRole("header", { name: "Sign in" })).toBeTruthy();

    await act(async () => sessionStore.set("signed-in"));
    expect(screen).toHavePathname("/courses/42");
    expect(screen).toHaveSearchParams({ id: "42", tab: "reviews" });
    expect(screen.getByText("Course 42")).toBeTruthy();
  });

  it("goes Home when there is no remembered destination", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    await act(async () => sessionStore.set("signed-in"));
    expect(screen).toHavePathname("/home");
  });

  it("returns to the same screen after the session expires mid-use", async () => {
    sessionStore.set("signed-in");
    await renderRouter(app, { initialUrl: "/courses/7" });
    expect(screen).toHavePathname("/courses/7");
    await act(async () => sessionStore.expire());
    expect(screen).toHavePathname("/sign-in");
    expect(screen).toHaveSearchParams({ returnTo: "/courses/7" });
    await act(async () => sessionStore.set("signed-in"));
    expect(screen).toHavePathname("/courses/7");
  });

  it.each([
    ["a full URL", "https%3A%2F%2Fevil.example%2Fphish"],
    ["a double slash", "%2F%2Fevil.example"],
    ["a scheme", "chartnexa%3A%2F%2Fhome"],
    ["a backslash", "%2Fhome%5Cx"],
    ["a parent segment", "%2Fcourses%2F..%2F..%2Fx"],
    ["the sign-in screen itself", "%2Fsign-in"],
  ])("ignores an unsafe destination (%s) and goes Home", async (_name, encoded) => {
    await renderRouter(app, { initialUrl: `/sign-in?returnTo=${encoded}` });
    await act(async () => sessionStore.set("signed-in"));
    expect(screen).toHavePathname("/home");
  });

  it("opens Home for a signed-in launch and Welcome for a signed-out one", async () => {
    await renderRouter(app, { initialUrl: "/" });
    expect(screen).toHavePathname("/welcome");
    sessionStore.set("signed-in");
    await renderRouter(app, { initialUrl: "/" });
    expect(screen).toHavePathname("/home");
  });
});

describe("tabs and back", () => {
  it("keeps each tab's own screen when switching tabs and coming back", async () => {
    sessionStore.set("signed-in");
    const view = await renderRouter(app, { initialUrl: "/courses" });
    await act(async () => router.push("/courses/42"));
    expect(view.getByText("Course 42")).toBeTruthy();

    // The tab bar is native, so a tab press is simulated with the same action it dispatches.
    const { result } = await renderHook(() => useNavigationContainerRef());
    const pressTab = (name: string) =>
      act(async () => result.current.dispatch({ type: "JUMP_TO", payload: { name } } as never));
    await pressTab("profile");
    expect(view).toHavePathname("/profile");
    await pressTab("courses");
    expect(view).toHavePathname("/courses/42");
    expect(view.getByText("Course 42")).toBeTruthy();
  });

  it("goes back to the previous screen when no overlay is open", async () => {
    sessionStore.set("signed-in");
    await renderRouter(app, { initialUrl: "/courses" });
    await act(async () => router.push("/courses/9"));
    await act(async () => router.back());
    expect(screen).toHavePathname("/courses");
  });

  it("closes an open sheet on back and leaves the screen underneath where it was", async () => {
    const back = mockBackHandler();
    sessionStore.set("signed-in");
    await renderRouter(app, { initialUrl: "/gallery" });
    expect(screen).toHavePathname("/gallery");
    await fireEvent.press(screen.getByRole("button", { name: "Information" }));
    expect(
      screen.getByText("Short, contextual content. Back closes this first.", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();

    let handled = false;
    await act(async () => {
      handled = back.pressBack();
    });
    expect(handled).toBe(true);
    expect(
      screen.queryByText("Short, contextual content. Back closes this first.", {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(screen).toHavePathname("/gallery");
    // Nothing open now, so back is left to the router.
    expect(back.pressBack()).toBe(false);
    back.restore();
  });
});

describe("unknown links", () => {
  it("shows a friendly not-found screen with a working way Home and no technical text", async () => {
    sessionStore.set("signed-in");
    await renderRouter(app, { initialUrl: "/no/such/route" });
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(screen.queryByText(/undefined|stack|Error|route/i)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Go to Home" }));
    expect(screen).toHavePathname("/home");
  });

  it("shows not-found, not sign-in, for an unknown link while signed out", async () => {
    await renderRouter(app, { initialUrl: "/definitely-not-a-route" });
    expect(screen.getByText("Page not found")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Go to Home" }));
    expect(screen).toHavePathname("/welcome");
  });
});

describe("placeholder screens", () => {
  it("shows empty states in the tabs and signs out from Profile", async () => {
    sessionStore.set("signed-in");
    await renderRouter(app, { initialUrl: "/home" });
    expect(screen.getByText("Courses are coming soon")).toBeTruthy();
    await act(async () => router.navigate("/courses"));
    expect(screen.getByText("No courses yet")).toBeTruthy();
    await act(async () => router.navigate("/profile"));
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(screen).toHavePathname("/sign-in");
    expect(sessionStore.get()).toBe("signed-out");
  });
});

describe("session ended by the API", () => {
  it("shows sign-in after the server rejects the session and returns to the same screen after signing in again", async () => {
    const api = new FakeApi();
    api.install();
    const pair = api.newSession();
    await sessionManager.signIn(pair);
    await renderRouter(app, { initialUrl: "/courses/5" });
    expect(screen).toHavePathname("/courses/5");

    // The session is revoked elsewhere; the next request finds out.
    api.sessions.get(pair.sessionId)!.revoked = true;
    api.expireAccessTokens();
    await act(async () => {
      await authedFetch("/me").catch(() => undefined);
    });
    expect(screen).toHavePathname("/sign-in");
    expect(screen).toHaveSearchParams({ returnTo: "/courses/5" });
    expect(screen.getByText(/Your session ended/)).toBeTruthy();

    await act(async () => sessionStore.set("signed-in"));
    expect(screen).toHavePathname("/courses/5");
    sessionManager._resetForTests();
  });
});
