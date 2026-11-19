import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Dimensions, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { accountApi } from "../src/auth/account-api";
import { staffCourseApi } from "../src/courses/course-api";
import { invitationApi } from "../src/invitations/invitation-api";
import { columnsFor } from "../src/kit/Grid";
import { ManagerDashboard } from "../src/staff/manager/ManagerDashboard";
import { appError } from "../test-utils/auth-mocks";

// What the server gives a Manager: no roles:manage, audit:read, payments:read_full or
// instructor_permissions:manage (decision Q38).
const MANAGER = {
  roles: ["student", "manager"],
  permissions: [
    "course:create",
    "course:update",
    "course:publish",
    "categories:manage",
    "enrollments:manage",
    "instructors:invite",
    "announcements:publish",
    "reviews:moderate",
    "payments:read_status",
    "users:read",
  ],
  courseGrants: [],
};
const ROUTES = [
  "manage",
  "manage/new",
  "manage/categories",
  "profile/invitations",
  "profile/staff-announcements",
  "profile/reviews",
  "profile/orders",
];
const at = (width: number, fontScale = 1) =>
  jest.spyOn(Dimensions, "get").mockReturnValue({ width, height: 800, scale: 2, fontScale });

const mount = async (access: Record<string, unknown> = MANAGER) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const stubs = Object.fromEntries(ROUTES.map((r) => [r, () => <Text>{`screen:${r}`}</Text>]));
  return renderRouter({
    _layout: () => {
      const { Slot } = jest.requireActual("expo-router");
      return (
        <QueryClientProvider client={client}>
          <Slot />
        </QueryClientProvider>
      );
    },
    index: () => <ManagerDashboard access={access as never} />,
    ...stubs,
  });
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(accountApi, "me").mockResolvedValue({
    id: "m1",
    email: "m@example.com",
    displayName: "Mia Manager",
    emailVerified: true,
    createdAt: "2026-11-17T00:00:00.000Z",
  } as never);
  jest.spyOn(staffCourseApi, "list").mockImplementation(async (q) => ({
    items: (q?.status === "draft" ? [] : [{ id: "c1" }, { id: "c2" }, { id: "c3" }]) as never,
    nextCursor: null,
  }));
  jest.spyOn(invitationApi, "instructors").mockResolvedValue([{ id: "i1" }, { id: "i2" }] as never);
  jest.spyOn(invitationApi, "list").mockResolvedValue({ items: [], nextCursor: null });
});

describe("the Manager header", () => {
  it("shows the brand, title, supporting line and a greeting, with only decorative graphics", async () => {
    at(393);
    await mount();
    expect(await screen.findByText("CHARTNEXA ACADEMY")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Manager Dashboard" })).toBeTruthy();
    expect(screen.getByText("Your academy operations at a glance.")).toBeTruthy();
    expect(await screen.findByText("Welcome back, Mia")).toBeTruthy();
    expect(screen.getByTestId("manager-header-mark", { hidden: true })).toBeTruthy();
    expect(screen.queryByText(/%|\$/)).toBeNull();
  });

  it("works without a name and drops the chart mark on narrow screens or large text", async () => {
    (accountApi.me as jest.Mock).mockResolvedValue({ displayName: null });
    at(320);
    await mount();
    await screen.findByTestId("manager-header");
    expect(screen.queryByText(/Welcome back/)).toBeNull();
    expect(screen.queryByTestId("manager-header-mark", { hidden: true })).toBeNull();
  });
});

describe("the four statistics", () => {
  it("come from the real lists, show zero as a value, and open their screens", async () => {
    at(393);
    await mount();
    expect(await screen.findByLabelText("Published courses: 3")).toBeTruthy();
    expect(screen.getByLabelText("Draft courses: 0")).toBeTruthy();
    expect(screen.getByLabelText("Instructors: 2")).toBeTruthy();
    expect(screen.getByLabelText("Pending invitations: 0")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Instructors: 2"));
    expect(screen).toHavePathname("/profile/invitations");
  });

  it("shows loading, a plain failure with retry, and recovers", async () => {
    at(393);
    (staffCourseApi.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
    (invitationApi.instructors as jest.Mock).mockRejectedValue(appError("unknown"));
    await mount();
    expect(await screen.findByLabelText("Published courses: loading")).toBeTruthy();
    expect(await screen.findByLabelText("Instructors: unavailable")).toBeTruthy();
    (invitationApi.instructors as jest.Mock).mockResolvedValue([{ id: "i1" }]);
    await fireEvent.press(screen.getByLabelText("Instructors: unavailable"));
    expect(await screen.findByLabelText("Instructors: 1")).toBeTruthy();
  });

  it.each([320, 360, 393, 430])(
    "uses the shared grid at %ddp (one column when narrow or text is large)",
    async (w) => {
      at(w);
      await mount();
      await screen.findByLabelText("Published courses: 3");
      expect(columnsFor(w, 1)).toBe(w < 340 ? 1 : 2);
      expect(columnsFor(w, 1.6)).toBe(1);
      expect(screen.getByTestId("academy-stats")).toBeTruthy();
    },
  );
});

describe("quick actions and management sections", () => {
  it("offers only actions a Manager may use, each opening a real screen", async () => {
    at(393);
    await mount();
    await screen.findByTestId("quick-Invite instructor");
    for (const [label, path] of [
      ["Manage courses", "/manage"],
      ["Invite instructor", "/profile/invitations"],
      ["New course", "/manage/new"],
    ] as const) {
      await fireEvent.press(screen.getByTestId(`quick-${label}`));
      expect(screen).toHavePathname(path);
      await screen.unmount();
      await mount();
      await screen.findByTestId("quick-Invite instructor");
    }
  });

  it("lists course, people and operations entries but never Admin-only ones", async () => {
    at(393);
    await mount();
    for (const tile of [
      "Courses",
      "Categories",
      "Students and access",
      "Instructors",
      "Announcements",
      "Review moderation",
      "Orders",
    ]) {
      expect(await screen.findByTestId(`tile-${tile}`)).toBeTruthy();
    }
    for (const tile of ["Permissions", "Audit log"]) {
      expect(screen.queryByTestId(`tile-${tile}`)).toBeNull();
    }
    expect(screen.getByText("Course management")).toBeTruthy();
    expect(screen.getByText("People management")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("tile-Categories"));
    expect(screen).toHavePathname("/manage/categories");
  });

  it("hides what the permissions do not allow and requests nothing for it", async () => {
    at(393);
    await mount({ ...MANAGER, permissions: ["instructors:invite"] });
    expect(await screen.findByLabelText("Pending invitations: 0")).toBeTruthy();
    expect(screen.queryByLabelText(/^Published courses/)).toBeNull();
    expect(screen.queryByTestId("quick-Manage courses")).toBeNull();
    expect(screen.queryByTestId("tile-Courses")).toBeNull();
    expect(staffCourseApi.list).not.toHaveBeenCalled();
  });
});

describe("refreshing", () => {
  it("pulls to refresh and reloads the real lists", async () => {
    at(393);
    await mount();
    await screen.findByLabelText("Published courses: 3");
    type N = { props: Record<string, unknown>; children?: (N | string)[] | null };
    const find = (n: N | string | null | undefined): N | undefined => {
      if (!n || typeof n === "string") return undefined;
      if (n.props["refreshControl"] !== undefined) return n;
      for (const c of n.children ?? []) {
        const hit = find(c);
        if (hit) return hit;
      }
      return undefined;
    };
    const json = screen.toJSON();
    const host = (Array.isArray(json) ? json : [json]).map((t) => find(t as N)).find(Boolean);
    expect(host).toBeTruthy();
    const before = (staffCourseApi.list as jest.Mock).mock.calls.length;
    await act(async () => {
      await (
        host!.props["refreshControl"] as { props: { onRefresh: () => Promise<void> } }
      ).props.onRefresh();
    });
    await waitFor(() =>
      expect((staffCourseApi.list as jest.Mock).mock.calls.length).toBeGreaterThan(before),
    );
  });
});
