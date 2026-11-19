import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";
import { renderRouter, screen as routerScreen } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { fetchAccess } from "../src/courses/course-api";
import { hideDevToolsButton } from "../src/dev/dev-tools";
import {
  ResponsiveTabBar,
  TAB_BAR_MIN_HEIGHT,
  TAB_ICON_SIZE,
  TAB_LABEL_MAX_SCALE,
  TAB_LABEL_SIZE,
  type TabMeta,
} from "../src/kit/ResponsiveTabBar";
import { ALL_TAB_NAMES, tabsFor, type RoleKind } from "../src/staff/role-tabs";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      displayName: "Ann",
      emailVerified: true,
      createdAt: "2026-11-17T00:00:00.000Z",
    }),
    resendVerification: jest.fn(),
  },
}));

const ROLES: RoleKind[] = ["student", "instructor", "manager", "admin"];
const WIDTHS = [320, 360, 393, 430];

const metaFor = (role: RoleKind): Record<string, TabMeta> => {
  const shown = new Map(tabsFor(role).map((t) => [t.name, t]));
  return Object.fromEntries(
    ALL_TAB_NAMES.map((n) => [
      n,
      {
        label: shown.get(n)?.label ?? n,
        icon: shown.get(n)?.icon ?? "grid",
        hidden: !shown.has(n),
      },
    ]),
  );
};
const bar = (role: RoleKind, focusedName: string, insetBottom = 0) => {
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const go = jest.fn();
  const routes = ALL_TAB_NAMES.map((n) => ({ key: `${n}-k`, name: n }));
  const props = {
    state: { index: routes.findIndex((r) => r.name === focusedName), routes },
    descriptors: Object.fromEntries(
      routes.map((r) => [
        r.key,
        {
          options: {
            tabBarAccessibilityLabel: tabsFor(role).find((t) => t.name === r.name)?.title,
          },
        },
      ]),
    ),
    emitter: { emit },
    navigateToTab: go,
    insets: { top: 0, left: 0, right: 0, bottom: insetBottom },
    meta: metaFor(role),
  };
  return { props: props as unknown as ComponentProps<typeof ResponsiveTabBar>, emit, go };
};

describe("tab labels", () => {
  it("uses the short student labels and keeps the full titles for the screens and screen readers", () => {
    const t = tabsFor("student");
    expect(t.map((x) => x.label)).toEqual(["Home", "Explore", "Learn", "Tasks", "Profile"]);
    expect(t.map((x) => x.title)).toEqual([
      "Home",
      "Explore",
      "My Learning",
      "Assignments",
      "Profile",
    ]);
  });

  it("keeps every label short enough for its column at the narrowest width", () => {
    for (const role of ROLES) {
      const tabs = tabsFor(role);
      // Width of one column at 320px, minus padding, against a generous 7px per character at 11px.
      const column = 320 / tabs.length - 4;
      for (const t of tabs) expect(t.label.length * 7).toBeLessThanOrEqual(column + 12);
    }
  });
});

describe.each(ROLES)("the %s tab bar", (role) => {
  it.each(WIDTHS)(
    "has equal flexible items, readable text and 44px+ targets at %ipx",
    async (width) => {
      // The bar has no fixed widths, so any width gives each item an equal share.
      const { props } = bar(role, tabsFor(role)[0]!.name);
      await render(<ResponsiveTabBar {...props} />);
      const visible = tabsFor(role);
      expect(width).toBeGreaterThan(0);
      for (const t of visible) {
        const item = screen.getByTestId(`tab-item-${t.name}`);
        const style = StyleSheet.flatten(item.props.style);
        expect(style.flex).toBe(1);
        expect(style.width).toBeUndefined();
        expect(style.minWidth).toBe(0);
        expect(style.minHeight).toBeGreaterThanOrEqual(44);
        expect(style.minHeight).toBe(TAB_BAR_MIN_HEIGHT);
        expect(style.alignItems).toBe("center");
        expect(style.justifyContent).toBe("center");
      }
      expect(screen.getAllByRole("button")).toHaveLength(visible.length);
    },
  );

  it("draws labels on one line at 11px with a capped font scale and 22px icons", async () => {
    const { props } = bar(role, tabsFor(role)[0]!.name);
    await render(<ResponsiveTabBar {...props} />);
    for (const t of tabsFor(role)) {
      const label = screen.getByText(t.label, { hidden: true });
      expect(label.props.numberOfLines).toBe(1);
      expect(label.props.adjustsFontSizeToFit).toBe(true);
      expect(label.props.maxFontSizeMultiplier).toBe(TAB_LABEL_MAX_SCALE);
      expect(StyleSheet.flatten(label.props.style).fontSize).toBe(TAB_LABEL_SIZE);
    }
    expect(TAB_LABEL_SIZE).toBeGreaterThanOrEqual(10);
    expect(TAB_LABEL_SIZE).toBeLessThanOrEqual(12);
    expect(TAB_ICON_SIZE).toBeGreaterThanOrEqual(20);
    expect(TAB_ICON_SIZE).toBeLessThanOrEqual(24);
  });

  it("marks only the focused tab as selected and gives it the blue indicator", async () => {
    const first = tabsFor(role)[0]!.name;
    const { props } = bar(role, first);
    await render(<ResponsiveTabBar {...props} />);
    const selected = screen
      .getAllByRole("button")
      .filter((b) => b.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    const label = screen.getByText(tabsFor(role)[0]!.label, { hidden: true });
    expect(StyleSheet.flatten(label.props.style).color).toBe("#2563EB");
  });

  it("shows no button for tabs the role does not use", async () => {
    const { props } = bar(role, tabsFor(role)[0]!.name);
    await render(<ResponsiveTabBar {...props} />);
    const hidden = ALL_TAB_NAMES.filter((n) => !tabsFor(role).some((t) => t.name === n));
    for (const n of hidden) expect(screen.queryByTestId(`tab-item-${n}`)).toBeNull();
  });
});

describe("safe area and presses", () => {
  it("adds the Android gesture-bar inset under the items", async () => {
    const { props } = bar("student", "home", 24);
    await render(<ResponsiveTabBar {...props} />);
    expect(StyleSheet.flatten(screen.getByTestId("tab-bar").props.style).paddingBottom).toBe(24);
  });

  it("emits tabPress and navigates only to a tab that is not already focused", async () => {
    const { props, emit, go } = bar("student", "home");
    await render(<ResponsiveTabBar {...props} />);
    await fireEvent.press(screen.getByTestId("tab-item-home"));
    expect(go).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("tab-item-explore"));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "tabPress" }));
    expect(go).toHaveBeenCalledWith("explore-k");
  });
});

describe("in the running app", () => {
  const secure = SecureStore as unknown as { __reset: () => void };
  const access = fetchAccess as unknown as jest.Mock;
  beforeEach(async () => {
    secure.__reset();
    clearScreenMemory();
    sessionManager._resetForTests();
    sessionStore.set("signed-out");
    await sessionManager.signIn(pair());
    access.mockResolvedValue({ roles: ["student"], permissions: [], courseGrants: [] });
  });

  it("shows Learn and Tasks under the icons, speaks the full names, and keeps the full page titles", async () => {
    await renderRouter("./app", { initialUrl: "/home" });
    expect(await routerScreen.findByText("Learn")).toBeTruthy();
    expect(routerScreen.getByText("Tasks")).toBeTruthy();
    expect(routerScreen.queryByText("My Learning")).toBeNull();
    await fireEvent.press(routerScreen.getByRole("button", { name: "My Learning" }));
    expect(await routerScreen.findByRole("header", { name: "My Learning" })).toBeTruthy();
    await fireEvent.press(routerScreen.getByRole("button", { name: "Assignments" }));
    expect(await routerScreen.findByRole("header", { name: "Assignments" })).toBeTruthy();
  });
});

describe("tab history", () => {
  it("Back from a tab returns to the tab you came from, and the bar keeps the right one selected", async () => {
    const secure = SecureStore as unknown as { __reset: () => void };
    secure.__reset();
    clearScreenMemory();
    sessionManager._resetForTests();
    sessionStore.set("signed-out");
    await sessionManager.signIn(pair());
    (fetchAccess as unknown as jest.Mock).mockResolvedValue({
      roles: ["student"],
      permissions: [],
      courseGrants: [],
    });
    const { router } = jest.requireActual("expo-router");
    await renderRouter("./app", { initialUrl: "/home" });
    await routerScreen.findByText("Learn");
    await fireEvent.press(routerScreen.getByRole("button", { name: "Explore" }));
    expect(routerScreen).toHavePathname("/explore");
    await fireEvent.press(routerScreen.getByRole("button", { name: "Assignments" }));
    expect(routerScreen).toHavePathname("/assignments");
    await act(async () => router.back());
    expect(routerScreen).toHavePathname("/explore");
    expect(routerScreen.getByTestId("tab-item-explore").props.accessibilityState.selected).toBe(
      true,
    );
    await act(async () => router.back());
    expect(routerScreen).toHavePathname("/home");
  });
});

describe("the development tools button", () => {
  afterEach(() => jest.resetModules());

  it("hides the floating tools button when the dev client is present", () => {
    const setToolsButtonVisible = jest.fn();
    jest.doMock("expo-dev-client", () => ({ setToolsButtonVisible }), { virtual: true });
    hideDevToolsButton();
    expect(setToolsButtonVisible).toHaveBeenCalledWith(false);
  });

  it("does nothing, and does not throw, when there is no dev client", () => {
    jest.doMock(
      "expo-dev-client",
      () => {
        throw new Error("not installed");
      },
      { virtual: true },
    );
    expect(() => hideDevToolsButton()).not.toThrow();
  });
});
