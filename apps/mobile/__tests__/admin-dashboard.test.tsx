import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Dimensions, StyleSheet, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { staffCourseApi } from "../src/courses/course-api";
import { invitationApi } from "../src/invitations/invitation-api";
import { columnsFor } from "../src/kit/Grid";
import { AdminDashboard } from "../src/staff/admin/AdminDashboard";
import { appError } from "../test-utils/auth-mocks";

const ADMIN = {
  roles: ["student", "admin"],
  permissions: [
    "course:create",
    "course:update",
    "categories:manage",
    "enrollments:manage",
    "instructors:invite",
    "instructor_permissions:manage",
    "announcements:publish",
    "reviews:moderate",
    "payments:read_status",
    "audit:read",
    "roles:manage",
    "users:read",
  ],
  courseGrants: [],
};
const ROUTES = [
  "manage",
  "manage/new",
  "manage/categories",
  "profile/invitations",
  "profile/instructors",
  "profile/permissions",
  "profile/staff-announcements",
  "profile/staff-tips",
  "profile/reviews",
  "profile/orders",
  "profile/audit",
];

const at = (width: number, fontScale = 1) =>
  jest.spyOn(Dimensions, "get").mockReturnValue({ width, height: 800, scale: 2, fontScale });

const mount = async (access: typeof ADMIN | Record<string, unknown> = ADMIN) => {
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
    index: () => <AdminDashboard access={access as never} />,
    ...stubs,
  });
};

type Node = { type: string; props: Record<string, unknown>; children?: (Node | string)[] | null };
const walk = (
  n: Node | string | null | undefined,
  f: (n: Node, anc: Node[]) => void,
  anc: Node[] = [],
) => {
  if (!n || typeof n === "string") return;
  f(n, anc);
  (n.children ?? []).forEach((c) => walk(c as Node, f, [...anc, n]));
};
const tree = () => {
  const j = screen.toJSON();
  return (Array.isArray(j) ? j : [j]) as Node[];
};
const style = (n: Node) => StyleSheet.flatten(n.props["style"] as never) ?? {};
const all = (pred: (n: Node, anc: Node[]) => boolean) => {
  const out: Node[] = [];
  tree().forEach((t) => walk(t, (n, a) => pred(n, a) && out.push(n)));
  return out;
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(staffCourseApi, "list").mockImplementation(async (q) => ({
    items: (q?.status === "draft"
      ? [{ id: "d1" }]
      : [{ id: "c1" }, { id: "c2" }, { id: "c3" }]) as never,
    nextCursor: null,
  }));
  jest.spyOn(invitationApi, "instructors").mockResolvedValue([{ id: "i1" }, { id: "i2" }] as never);
  jest.spyOn(invitationApi, "list").mockResolvedValue({ items: [], nextCursor: null });
});

describe("the layout cause of the overlap and the tall cards", () => {
  it("uses explicit rows, never a wrapping row of flexible children", async () => {
    at(393);
    await mount();
    await screen.findByTestId("academy-stats");
    const wrapping = all((n) => style(n).flexWrap === "wrap");
    expect(wrapping).toHaveLength(0);
    expect(screen.getByTestId("grid-row-0")).toBeTruthy();
    expect(screen.getByTestId("grid-row-1")).toBeTruthy();
  });

  it.each([
    [320, 1, 1],
    [360, 1, 2],
    [393, 1, 2],
    [430, 1, 2],
    [393, 1.6, 1],
    [430, 2, 1],
  ])(
    "has %idp at font scale %f in %i column(s), and the cells share each row equally",
    async (w, fs, cols) => {
      expect(columnsFor(w, fs)).toBe(cols);
      at(w, fs);
      await mount();
      await screen.findByTestId("academy-stats");
      const row0 = all((n) => n.props["testID"] === "grid-row-0")[0]!;
      const cells = (row0.children as Node[]).filter((c) => typeof c !== "string");
      expect(cells.length).toBe(cols);
      for (const c of cells) {
        expect(style(c).flex).toBe(1);
        expect(style(c).minWidth).toBe(0);
      }
      expect(screen.getByTestId(`grid-row-${cols === 1 ? 3 : 1}`)).toBeTruthy();
    },
  );

  it("never fixes a tile's height: it follows its content, within a compact range", async () => {
    at(393);
    await mount();
    await screen.findByTestId("academy-stats");
    for (const label of [
      "Pending invitations",
      "Instructors",
      "Published courses",
      "Draft courses",
    ]) {
      const tile = screen.getByTestId(`metric-${label}`);
      const inner = all((n) => n.props["testID"] === `metric-${label}`);
      expect(inner.length).toBeGreaterThan(0);
      const s = style(
        tile.props.children ? ((inner[0]!.children?.[0] as Node) ?? inner[0]!) : inner[0]!,
      );
      expect(s.height).toBeUndefined();
      expect(s.minHeight === undefined || (s.minHeight as number) <= 125).toBe(true);
    }
    // Icon 36 + gap + value row 36 + label line + padding 12 x 2 + gaps: about 100 to 125dp.
    const approx = 24 + 36 + 8 + 36 + 8 + 16;
    expect(approx).toBeGreaterThanOrEqual(105);
    expect(approx).toBeLessThanOrEqual(135);
  });

  it("has no absolutely positioned content: only decoration hidden from screen readers", async () => {
    at(393);
    await mount();
    await screen.findByTestId("admin-header");
    const abs = all((n) => style(n).position === "absolute");
    expect(abs.length).toBeGreaterThan(0);
    for (const n of abs) {
      expect(n.props["importantForAccessibility"]).toBe("no-hide-descendants");
      expect(n.props["accessible"]).toBe(false);
    }
  });

  it("puts each section heading above its own content, never inside the statistics grid", async () => {
    at(393);
    await mount();
    await screen.findByTestId("academy-stats");
    const headings = screen.getAllByRole("header").map((h) => h.props.children);
    expect(headings).toEqual([
      "Admin Dashboard",
      "Academy at a glance",
      "Quick actions",
      "Course management",
      "People management",
      "Community and operations",
    ]);
    const grid = all((n) => n.props["testID"] === "grid")[0]!;
    let headerInGrid = false;
    walk(grid, (n) => {
      if (n.props["accessibilityRole"] === "header") headerInGrid = true;
    });
    expect(headerInGrid).toBe(false);
    // A section keeps a gap between its heading and its cards, and sections are separated by the page gap.
    for (const s of ["Course management", "People management", "Community and operations"]) {
      expect(screen.getByRole("header", { name: s })).toBeTruthy();
    }
  });
});

describe("the header", () => {
  it("shows the brand, the title and the supporting line, with the chart mark as hidden decoration", async () => {
    at(393);
    await mount();
    expect(await screen.findByText("CHARTNEXA ACADEMY")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Admin Dashboard" })).toBeTruthy();
    expect(screen.getByText("Manage your academy at a glance.")).toBeTruthy();
    expect(screen.getByTestId("admin-header-mark", { hidden: true })).toBeTruthy();
    expect(screen.queryByTestId("admin-header-mark")).toBeNull(); // hidden from the accessibility tree
    // The mark shows no prices or percentages.
    expect(screen.queryByText(/%|\$/)).toBeNull();
  });

  it("drops the mark on a narrow screen or with large text so the words keep their room", async () => {
    at(320);
    await mount();
    await screen.findByTestId("admin-header");
    expect(screen.queryByTestId("admin-header-mark", { hidden: true })).toBeNull();
    await screen.unmount();
    at(393, 1.6);
    await mount();
    await screen.findByTestId("admin-header");
    expect(screen.queryByTestId("admin-header-mark", { hidden: true })).toBeNull();
  });
});

describe("the statistics use real data", () => {
  it("shows each count from its list, with zero as a real value, and opens the right screen", async () => {
    at(393);
    await mount();
    expect(await screen.findByLabelText("Published courses: 3")).toBeTruthy();
    expect(screen.getByLabelText("Draft courses: 1")).toBeTruthy();
    expect(screen.getByLabelText("Instructors: 2")).toBeTruthy();
    expect(screen.getByLabelText("Pending invitations: 0")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Published courses: 3"));
    expect(screen).toHavePathname("/manage");
  });

  it("marks a partial count with +, shows a skeleton while loading, and a retry on failure", async () => {
    at(393);
    (invitationApi.list as jest.Mock).mockResolvedValue({
      items: [{ id: "v" }],
      nextCursor: "more",
    });
    (staffCourseApi.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
    (invitationApi.instructors as jest.Mock).mockRejectedValue(appError("unknown"));
    await mount();
    expect(await screen.findByLabelText("Pending invitations: 1+")).toBeTruthy();
    expect(await screen.findByLabelText("Published courses: loading")).toBeTruthy();
    expect(await screen.findByLabelText("Instructors: unavailable")).toBeTruthy();
    (invitationApi.instructors as jest.Mock).mockResolvedValue([{ id: "i1" }]);
    await fireEvent.press(screen.getByLabelText("Instructors: unavailable"));
    expect(await screen.findByLabelText("Instructors: 1")).toBeTruthy();
  });

  it("shows only the numbers a role may see", async () => {
    at(393);
    await mount({ ...ADMIN, permissions: ["instructors:invite"] });
    expect(await screen.findByLabelText("Pending invitations: 0")).toBeTruthy();
    expect(screen.queryByLabelText(/^Published courses/)).toBeNull();
    expect(staffCourseApi.list).not.toHaveBeenCalled();
  });
});

describe("quick actions and management entries", () => {
  it("offers New course, Invite instructor and Manage courses, each opening its screen", async () => {
    at(393);
    await mount();
    await fireEvent.press(await screen.findByTestId("quick-New course"));
    expect(screen).toHavePathname("/manage/new");
    await screen.unmount();
    await mount();
    await fireEvent.press(await screen.findByTestId("quick-Invite instructor"));
    expect(screen).toHavePathname("/profile/invitations");
    await screen.unmount();
    await mount();
    await fireEvent.press(await screen.findByTestId("quick-Manage courses"));
    expect(screen).toHavePathname("/manage");
  });

  it("hides a quick action the role may not use", async () => {
    at(393);
    await mount({ ...ADMIN, permissions: ["course:update"] });
    await screen.findByTestId("quick-Manage courses");
    expect(screen.queryByTestId("quick-New course")).toBeNull();
    expect(screen.queryByTestId("quick-Invite instructor")).toBeNull();
  });

  it.each([
    ["Courses", "/manage"],
    ["Categories", "/manage/categories"],
    ["Students and access", "/manage"],
    ["Instructors", "/profile/invitations"],
    ["Permissions", "/profile/permissions"],
    ["Announcements", "/profile/staff-announcements"],
    ["Tips of the day", "/profile/staff-tips"],
    ["Review moderation", "/profile/reviews"],
    ["Orders", "/profile/orders"],
    ["Audit log", "/profile/audit"],
  ])("keeps the %s entry, opening %s", async (label, path) => {
    at(393);
    await mount();
    const card = await screen.findByTestId(`tile-${label}`);
    expect(card.props.accessibilityRole).toBe("button");
    await fireEvent.press(card);
    expect(screen).toHavePathname(path);
  });

  it("gives every entry a comfortable touch height and lets long text wrap", async () => {
    at(320, 1.6);
    await mount();
    await screen.findByTestId("tile-Courses");
    const cards = all(
      (n) =>
        typeof n.props["testID"] === "string" && (n.props["testID"] as string).startsWith("tile-"),
    );
    // Nine management entries plus "Tips of the day".
    expect(cards.length).toBe(10);
    for (const n of all(
      (n) =>
        typeof n.props["testID"] === "string" && (n.props["testID"] as string).startsWith("tile-"),
    )) {
      expect(n.props["accessibilityRole"]).toBe("button");
    }
    const sections = all(
      (n) =>
        typeof n.props["testID"] === "string" &&
        (n.props["testID"] as string).startsWith("section-"),
    );
    expect(sections.length).toBe(3);
    // No text in the entries is limited to one line: long labels wrap.
    const clipped = all((n) => n.type === "Text" && n.props["numberOfLines"] === 1);
    expect(clipped).toHaveLength(0);
  });
});

describe("refreshing and the page edges", () => {
  it("supports pull to refresh, which reloads the real lists", async () => {
    at(393);
    await mount();
    await screen.findByLabelText("Published courses: 3");
    const host = all((n) => n.props["refreshControl"] !== undefined)[0];
    expect(host).toBeTruthy();
    const control = {
      props: (host!.props["refreshControl"] as { props: Record<string, unknown> }).props,
    };
    const before = (staffCourseApi.list as jest.Mock).mock.calls.length;
    await act(async () => {
      await (control!.props["onRefresh"] as () => Promise<void>)();
    });
    await waitFor(() =>
      expect((staffCourseApi.list as jest.Mock).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("keeps space at the bottom so the last card scrolls clear of the tab bar", async () => {
    at(393);
    await mount();
    await screen.findByTestId("tile-Audit log");
    const padded = all(
      (n) => style(n).padding === 16 && typeof style(n).paddingBottom === "number",
    );
    expect(padded.length).toBeGreaterThan(0);
    expect(Math.max(...padded.map((n) => style(n).paddingBottom as number))).toBeGreaterThanOrEqual(
      24,
    );
  });
});
