import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo, Dimensions, StyleSheet, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { StaffCoursesScreen } from "../src/courses/screens/StaffCoursesScreen";
import { appError } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  staffCourseApi: { list: jest.fn() },
  fetchAccess: jest.fn(),
}));

const access = fetchAccess as unknown as jest.Mock;
const list = staffCourseApi.list as unknown as jest.Mock;
const INSTRUCTOR = {
  roles: ["student", "instructor"],
  permissions: ["course:create", "course:update"],
  courseGrants: [],
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
const page = (items: unknown[]) => ({ items, nextCursor: null });
const at = (width: number, fontScale = 1) =>
  jest.spyOn(Dimensions, "get").mockReturnValue({ width, height: 800, scale: 2, fontScale });

const mount = (url = "/") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRouter(
    {
      _layout: () => {
        const { Slot } = jest.requireActual("expo-router");
        return (
          <QueryClientProvider client={client}>
            <Slot />
          </QueryClientProvider>
        );
      },
      index: StaffCoursesScreen,
      "manage/new": () => <Text>screen:new</Text>,
      "manage/categories": () => <Text>screen:categories</Text>,
      "manage/[id]": () => <Text>screen:edit</Text>,
    },
    { initialUrl: url },
  );
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
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  access.mockResolvedValue(INSTRUCTOR);
  list.mockReset();
  list.mockImplementation(async (q: { status?: string }) =>
    page(
      q?.status === "draft"
        ? [course("d1", { status: "draft", title: "Draft one" })]
        : q?.status === "published"
          ? [course("p1")]
          : [course("p1"), course("d1", { status: "draft", title: "Draft one" })],
    ),
  );
});

describe("the page header", () => {
  it("shows Manage Courses with a supporting line and a New course action to the existing flow", async () => {
    at(393);
    await mount();
    expect(await screen.findByRole("header", { name: "Manage Courses" })).toBeTruthy();
    expect(screen.getByText("Create, edit and publish the courses you teach.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "New course" }));
    expect(screen).toHavePathname("/manage/new");
  });

  it("hides New course and Categories from someone without those permissions", async () => {
    at(393);
    access.mockResolvedValue({ ...INSTRUCTOR, permissions: ["course:update"] });
    await mount();
    await screen.findByRole("header", { name: "Manage Courses" });
    expect(screen.queryByRole("button", { name: "New course" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Categories" })).toBeNull();
  });

  it("offers Categories with the permission", async () => {
    at(393);
    access.mockResolvedValue({
      ...INSTRUCTOR,
      permissions: ["course:update", "categories:manage"],
    });
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "Categories" }));
    expect(screen).toHavePathname("/manage/categories");
  });
});

describe("the filters", () => {
  it("shows All, Drafts and Published as one segmented control with the selection announced", async () => {
    at(393);
    await mount();
    await screen.findByTestId("staff-course-p1");
    for (const n of ["All", "Drafts", "Published"])
      expect(screen.getByRole("button", { name: n })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" }).props.accessibilityState.selected).toBe(
      true,
    );
    await fireEvent(screen.getByTestId("status-filter"), "layout", {
      nativeEvent: { layout: { width: 361, height: 52 } },
    });
    expect(await screen.findByTestId("status-filter-indicator", { hidden: true })).toBeTruthy();
  });

  it("filters at once, asks the server for that status, and moves the selection", async () => {
    at(393);
    await mount();
    await screen.findByTestId("staff-course-p1");
    await fireEvent.press(screen.getByRole("button", { name: "Drafts" }));
    await waitFor(() => expect(list).toHaveBeenCalledWith({ status: "draft" }));
    expect(screen.getByRole("button", { name: "Drafts" }).props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "All" }).props.accessibilityState.selected).toBe(
      false,
    );
    await waitFor(() => expect(screen.queryByTestId("staff-course-p1")).toBeNull());
    expect(screen.getByText("Draft one")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Published" }));
    await waitFor(() => expect(list).toHaveBeenCalledWith({ status: "published" }));
    expect(await screen.findByTestId("staff-course-p1")).toBeTruthy();
  });

  it("opens already filtered when the dashboard sends ?status=draft", async () => {
    at(393);
    await mount("/?status=draft");
    expect(await screen.findByText("Draft one")).toBeTruthy();
    expect(list).toHaveBeenCalledWith({ status: "draft" });
    expect(screen.getByRole("button", { name: "Drafts" }).props.accessibilityState.selected).toBe(
      true,
    );
    // An unknown value is ignored.
    await screen.unmount();
    list.mockClear();
    await mount("/?status=nonsense");
    await screen.findByTestId("staff-course-p1");
    expect(list).toHaveBeenCalledWith({});
  });

  it("keeps the old list on screen, dimmed, while the next filter loads, instead of flashing blank", async () => {
    at(393);
    await mount();
    await screen.findByTestId("staff-course-p1");
    list.mockImplementation(() => new Promise(() => {}));
    await fireEvent.press(screen.getByRole("button", { name: "Drafts" }));
    expect(screen.getByTestId("staff-course-p1")).toBeTruthy();
    await waitFor(() =>
      expect(style(all((n) => n.props["testID"] === "staff-course-list")[0]!).opacity).toBe(0.55),
    );
  });

  it("says what is missing for each empty filter", async () => {
    at(393);
    list.mockResolvedValue(page([]));
    await mount();
    expect(await screen.findByText("Create the first course.")).toBeTruthy();
    await fireEvent.press(screen.getAllByRole("button", { name: "New course" }).at(-1)!);
    expect(screen).toHavePathname("/manage/new");
    await screen.unmount();
    await mount("/?status=draft");
    expect(await screen.findByText("No drafts. Every course you have is published.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Published" }));
    expect(
      await screen.findByText("Nothing is published yet. Publish a draft when it is ready."),
    ).toBeTruthy();
  });
});

describe("loading and errors", () => {
  it("shows skeleton cards while loading", async () => {
    at(393);
    list.mockImplementation(() => new Promise(() => {}));
    await mount();
    expect((await screen.findAllByTestId("course-skeleton")).length).toBe(3);
  });

  it("shows an error with Retry, and recovers", async () => {
    at(393);
    list.mockRejectedValueOnce(appError("unknown"));
    await mount();
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("staff-course-p1")).toBeTruthy();
  });
});

describe("the course cards", () => {
  it("shows status in words and colour, the level and the price, and opens the course to edit", async () => {
    at(393);
    await mount();
    const card = await screen.findByTestId("staff-course-d1");
    expect(screen.getByTestId("status-d1").props.children).toBe("Draft");
    expect(screen.getByTestId("status-p1").props.children).toBe("Published");
    expect(screen.getAllByText("Beginner").length).toBe(2);
    expect(screen.getByTestId("price-p1").props.children).toBe("$49.00");
    expect(screen.getByLabelText("Draft one, Draft, Beginner, $49.00")).toBeTruthy();
    await fireEvent.press(card);
    expect(screen).toHavePathname("/manage/d1");
  });

  it.each([320, 360, 393, 430])(
    "wraps a long title and never clips the price at %idp",
    async (w) => {
      at(w);
      const long = "Risk Management & Trading Psychology for Serious Learners and Professionals";
      list.mockResolvedValue(page([course("p1", { title: long, priceCents: 1299900 })]));
      await mount();
      const title = await screen.findByText(long);
      expect(title.props.numberOfLines).toBe(3);
      expect(screen.getByTestId("price-p1").props.children).toBe("$12,999.00");
      expect(style(screen.getByTestId("price-p1")).flexShrink).toBe(0);
      const body = all((n) => style(n).flex === 1 && style(n).minWidth === 0);
      expect(body.length).toBeGreaterThan(0);
      // No fixed height on a card.
      for (const n of all((n) => n.props["testID"] === "staff-course-p1"))
        expect(style(n).height).toBeUndefined();
    },
  );

  it("keeps room at the bottom so the last card clears the tab bar", async () => {
    at(393);
    await mount();
    await screen.findByTestId("staff-course-p1");
    const host = all((n) => n.props["testID"] === "staff-course-list")[0]!;
    const padding = Number(
      StyleSheet.flatten(host.props["contentContainerStyle"] as never)?.paddingBottom ?? 0,
    );
    expect(padding).toBeGreaterThanOrEqual(32);
  });
});

describe("nothing breaks for other roles", () => {
  it("keeps the same list screen for staff roles and the access rule for everyone else", async () => {
    at(393);
    access.mockResolvedValue({ roles: ["student"], permissions: [], courseGrants: [] });
    await mount();
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
  });
});
