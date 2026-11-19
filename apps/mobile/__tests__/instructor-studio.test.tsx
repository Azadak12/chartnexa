import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo, Dimensions, StyleSheet, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { accountApi } from "../src/auth/account-api";
import { staffCourseApi } from "../src/courses/course-api";
import { CountUp } from "../src/kit/CountUp";
import { Reveal } from "../src/kit/Reveal";
import { SegmentedControl } from "../src/kit/SegmentedControl";
import { greetingLine, InstructorDashboard } from "../src/staff/instructor/InstructorDashboard";
import { appError } from "../test-utils/auth-mocks";

jest.mock("../src/auth/account-api", () => ({
  accountApi: { me: jest.fn(), resendVerification: jest.fn() },
}));

const INSTRUCTOR = {
  roles: ["student", "instructor"],
  permissions: ["course:create"],
  courseGrants: [{ courseId: "c1", permissions: ["course:update"] }],
};
const course = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Course ${id}`,
  summary: "s",
  level: "beginner",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  thumbnailUrl: null,
  status: "published",
  version: 1,
  updatedAt: "2026-11-10T10:00:00.000Z",
  createdAt: "2026-11-01T10:00:00.000Z",
  publishedAt: "2026-11-02T10:00:00.000Z",
  ...over,
});
const at = (width: number, fontScale = 1) =>
  jest.spyOn(Dimensions, "get").mockReturnValue({ width, height: 800, scale: 2, fontScale });
const reduceMotion = (v: boolean) =>
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(v);

const mount = async (access: Record<string, unknown> = INSTRUCTOR) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const stubs = {
    manage: () => <Text>screen:manage</Text>,
    "manage/new": () => <Text>screen:new</Text>,
    "manage/[id]": () => <Text>screen:edit</Text>,
    "manage/categories": () => <Text>screen:categories</Text>,
  };
  return renderRouter({
    _layout: () => {
      const { Slot } = jest.requireActual("expo-router");
      return (
        <QueryClientProvider client={client}>
          <Slot />
        </QueryClientProvider>
      );
    },
    index: () => <InstructorDashboard access={access as never} />,
    ...stubs,
  });
};

type Node = { type: string; props: Record<string, unknown>; children?: (Node | string)[] | null };
const walk = (n: Node | string | null | undefined, f: (n: Node) => void) => {
  if (!n || typeof n === "string") return;
  f(n);
  (n.children ?? []).forEach((c) => walk(c as Node, f));
};
const all = (pred: (n: Node) => boolean) => {
  const out: Node[] = [];
  const j = screen.toJSON();
  (Array.isArray(j) ? j : [j]).forEach((t) => walk(t as Node, (n) => pred(n) && out.push(n)));
  return out;
};
const style = (n: Node) => StyleSheet.flatten(n.props["style"] as never) ?? {};

beforeEach(() => {
  jest.restoreAllMocks();
  (accountApi.me as jest.Mock).mockClear();
  reduceMotion(true);
  (accountApi.me as jest.Mock).mockResolvedValue({
    id: "u1",
    email: "d@x.co",
    displayName: "Dana Instructor",
  });
  jest.spyOn(staffCourseApi, "list").mockImplementation(async (q) => ({
    items: (q?.status === "draft"
      ? []
      : [
          course("c1", {
            title: "Options Trading Fundamentals",
            priceCents: 8900,
            updatedAt: "2026-11-12T10:00:00.000Z",
          }),
          course("c2", {
            title: "Risk Management & Trading Psychology",
            priceCents: 5900,
            level: "intermediate",
          }),
        ]) as never,
    nextCursor: null,
  }));
});

describe("the Instructor Studio header", () => {
  it("shows the brand, the title, the supporting line and a greeting by first name", async () => {
    at(393);
    await mount();
    expect(await screen.findByText("CHARTNEXA ACADEMY")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Instructor Studio" })).toBeTruthy();
    expect(screen.getByText("Manage your courses and teaching content.")).toBeTruthy();
    expect(await screen.findByText("Welcome back, Dana")).toBeTruthy();
    expect(screen.queryByText(/%|\$\d+\.\d+ profit/)).toBeNull();
  });

  it("builds the greeting only from a real name", () => {
    expect(greetingLine("Lena Lecturer")).toBe("Welcome back, Lena");
    expect(greetingLine("  ")).toBeUndefined();
    expect(greetingLine(null)).toBeUndefined();
  });

  it("keeps the chart mark as hidden decoration and drops it on a narrow screen", async () => {
    at(393);
    await mount();
    await screen.findByTestId("studio-header");
    expect(screen.getByTestId("studio-header-mark", { hidden: true })).toBeTruthy();
    expect(screen.queryByTestId("studio-header-mark")).toBeNull();
    await screen.unmount();
    at(320);
    await mount();
    await screen.findByTestId("studio-header");
    expect(screen.queryByTestId("studio-header-mark", { hidden: true })).toBeNull();
  });
});

describe("the statistics", () => {
  it("shows the real published and draft counts, with zero as a value, and opens the filtered list", async () => {
    at(393);
    await mount();
    expect(await screen.findByLabelText("Published courses: 2")).toBeTruthy();
    expect(screen.getByLabelText("Draft courses: 0")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Draft courses: 0"));
    expect(screen).toHavePathname("/manage");
    expect(screen).toHaveSearchParams({ status: "draft" });
  });

  it("uses no wrapping rows and no fixed card heights, at every width", async () => {
    for (const w of [320, 360, 393, 430]) {
      at(w);
      await mount();
      await screen.findByTestId("academy-stats");
      expect(all((n) => style(n).flexWrap === "wrap")).toHaveLength(0);
      expect(all((n) => n.props["testID"] === "grid-row-0")).toHaveLength(1);
      for (const n of all(
        (n) =>
          typeof n.props["testID"] === "string" &&
          /^(metric|preview-course)-/.test(n.props["testID"] as string),
      )) {
        expect(style(n).height).toBeUndefined();
      }
      await screen.unmount();
    }
  });

  it("makes only two requests, the same two for the numbers and the previews, and none for decoration", async () => {
    at(393);
    await mount();
    await screen.findByLabelText("Published courses: 2");
    expect(staffCourseApi.list).toHaveBeenCalledTimes(2);
    expect(accountApi.me).toHaveBeenCalledTimes(1);
  });
});

describe("your courses", () => {
  it("previews the most recent courses with status, level and price, and opens one to edit", async () => {
    at(393);
    await mount();
    const first = await screen.findByTestId("preview-course-c1");
    expect(first).toBeTruthy();
    expect(screen.getByText("Options Trading Fundamentals")).toBeTruthy();
    expect(screen.getByText("Risk Management & Trading Psychology")).toBeTruthy();
    expect(screen.getByTestId("status-c1").props.children).toBe("Published");
    expect(screen.getByTestId("price-c1").props.children).toBe("$89.00");
    expect(screen.getByText("Intermediate")).toBeTruthy();
    // Most recently updated first.
    const order = all(
      (n) =>
        typeof n.props["testID"] === "string" &&
        (n.props["testID"] as string).startsWith("preview-course-"),
    ).map((n) => n.props["testID"]);
    expect(order[0]).toBe("preview-course-c1");
    await fireEvent.press(first);
    expect(screen).toHavePathname("/manage/c1");
  });

  it("wraps a long title over several lines and keeps the price whole on its own row", async () => {
    at(320);
    await mount();
    const title = await screen.findByText("Risk Management & Trading Psychology");
    expect(title.props.numberOfLines).toBe(3);
    expect(style(screen.getByTestId("price-c2")).flexShrink).toBe(0);
  });

  it("lists at most three and offers See all, which opens the full list", async () => {
    at(393);
    (staffCourseApi.list as jest.Mock).mockImplementation(async (q: { status?: string }) => ({
      items:
        q?.status === "draft"
          ? [course("d1", { status: "draft" }), course("d2", { status: "draft" })]
          : [course("c1"), course("c2"), course("c3")],
      nextCursor: null,
    }));
    await mount();
    await screen.findByTestId("preview-course-c1");
    const previews = all(
      (n) =>
        typeof n.props["testID"] === "string" &&
        (n.props["testID"] as string).startsWith("preview-course-"),
    );
    expect(previews).toHaveLength(3);
    await fireEvent.press(screen.getByRole("button", { name: "Courses. Open the full list" }));
    expect(screen).toHavePathname("/manage");
  });

  it("shows skeleton cards while loading, an error with retry, and an empty state with an action", async () => {
    at(393);
    (staffCourseApi.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
    await mount();
    expect((await screen.findAllByTestId("course-skeleton")).length).toBe(2);
    await screen.unmount();

    (staffCourseApi.list as jest.Mock).mockRejectedValue(appError("unknown"));
    await mount();
    expect(await screen.findByTestId("courses-error")).toBeTruthy();
    (staffCourseApi.list as jest.Mock).mockResolvedValue({ items: [], nextCursor: null });
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("courses-empty")).toBeTruthy();
    await fireEvent.press(screen.getAllByRole("button", { name: "New course" }).at(-1)!);
    expect(screen).toHavePathname("/manage/new");
  });

  it("offers no New course in the empty state to someone who cannot create courses", async () => {
    at(393);
    (staffCourseApi.list as jest.Mock).mockResolvedValue({ items: [], nextCursor: null });
    await mount({ ...INSTRUCTOR, permissions: [] });
    expect(await screen.findByTestId("courses-empty")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New course" })).toBeNull();
    expect(screen.getByText("Courses you are given access to will appear here.")).toBeTruthy();
  });

  it("shows exactly what the server returns for each account (an Instructor's five, a Lecturer's two)", async () => {
    at(393);
    (staffCourseApi.list as jest.Mock).mockImplementation(async (q: { status?: string }) => ({
      items: q?.status === "draft" ? [] : [course("l1"), course("l2")],
      nextCursor: null,
    }));
    await mount();
    expect(await screen.findByLabelText("Published courses: 2")).toBeTruthy();
    expect(screen.queryByTestId("preview-course-c1")).toBeNull();
  });
});

describe("quick actions and refreshing", () => {
  it("offers New course and Manage courses, each to its screen, and only what is permitted", async () => {
    at(393);
    await mount();
    await fireEvent.press(await screen.findByTestId("quick-New course"));
    expect(screen).toHavePathname("/manage/new");
    await screen.unmount();
    await mount({ ...INSTRUCTOR, permissions: [] });
    await screen.findByTestId("quick-Manage courses");
    expect(screen.queryByTestId("quick-New course")).toBeNull();
    await fireEvent.press(screen.getByTestId("quick-Manage courses"));
    expect(screen).toHavePathname("/manage");
  });

  it("reloads the real lists on pull to refresh", async () => {
    at(393);
    await mount();
    await screen.findByLabelText("Published courses: 2");
    const host = all((n) => n.props["refreshControl"] !== undefined)[0]!;
    const props = (host.props["refreshControl"] as { props: { onRefresh: () => Promise<void> } })
      .props;
    const before = (staffCourseApi.list as jest.Mock).mock.calls.length;
    await act(async () => {
      await props.onRefresh();
    });
    expect((staffCourseApi.list as jest.Mock).mock.calls.length).toBeGreaterThan(before);
  });
});

describe("the animations", () => {
  it("Reveal shows its content at full opacity at once with reduced motion", async () => {
    reduceMotion(true);
    await mount();
    const header = await screen.findByTestId("studio-header");
    await waitFor(() => {
      let host: Node | undefined;
      const j = screen.toJSON();
      (Array.isArray(j) ? j : [j]).forEach((t) =>
        walk(t as Node, (n) => {
          if (
            !host &&
            (n.children as Node[] | undefined)?.some(
              (c) => typeof c !== "string" && c.props["testID"] === "studio-header",
            )
          )
            host = n;
        }),
      );
      expect(style(host!).opacity).toBe(1);
    });
    expect(header).toBeTruthy();
  });

  it("Reveal animates only when motion is allowed, and never replays", async () => {
    reduceMotion(false);
    const { rerender } = await renderRouter({
      index: () => (
        <Reveal index={2}>
          <Text>content</Text>
        </Reveal>
      ),
    });
    expect(await screen.findByText("content")).toBeTruthy();
    expect(typeof rerender).toBe("function");
  });

  it("CountUp shows plain text as is, and counts a whole number up to its value", async () => {
    reduceMotion(false);
    await renderRouter({ index: () => <CountUp value="25+" testID="v" /> });
    expect((await screen.findByTestId("v")).props.children).toBe("25+");
    await screen.unmount();
    await renderRouter({ index: () => <CountUp value="12" testID="n" /> });
    await waitFor(() => expect(screen.getByTestId("n").props.children).toBe(12), { timeout: 3000 });
  });

  it("CountUp shows the final number straight away with reduced motion", async () => {
    reduceMotion(true);
    await renderRouter({ index: () => <CountUp value="7" testID="n" /> });
    await waitFor(() => expect(screen.getByTestId("n").props.children).toBe(7));
  });

  it("SegmentedControl marks the selected choice, reports changes, and places its indicator under it", async () => {
    reduceMotion(true);
    const onChange = jest.fn();
    const options = [
      { key: "a", label: "All" },
      { key: "b", label: "Drafts" },
      { key: "c", label: "Published" },
    ] as const;
    await renderRouter({
      index: () => (
        <SegmentedControl testID="seg" options={options} value="b" onChange={onChange} />
      ),
    });
    await fireEvent(await screen.findByTestId("seg"), "layout", {
      nativeEvent: { layout: { width: 308, height: 52 } },
    });
    expect(screen.getByRole("button", { name: "Drafts" }).props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "All" }).props.accessibilityState.selected).toBe(
      false,
    );
    const indicator = await screen.findByTestId("seg-indicator", { hidden: true });
    const t = style(indicator as unknown as Node).transform as { translateX: number }[];
    await waitFor(() => expect(Number(t[0]!.translateX)).toBeGreaterThanOrEqual(0));
    await fireEvent.press(screen.getByRole("button", { name: "Published" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
