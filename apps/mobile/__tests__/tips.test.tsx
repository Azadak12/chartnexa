import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StaffTip, TipOfTheDay } from "@chartnexa/api-contracts";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { dayLabel, TipOfTheDayCard } from "../src/tips/TipOfTheDayCard";
import { StaffTipsScreen } from "../src/tips/StaffTipsScreen";
import { staffTipApi, tipApi } from "../src/tips/tip-api";
import { appError } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  fetchAccess: jest.fn(),
}));
const access = fetchAccess as unknown as jest.Mock;

const mount = async (
  element: React.ReactElement,
  extra: Record<string, () => React.ReactElement> = {},
) => {
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
      index: () => element,
      ...extra,
      // Start at the root every time: the router keeps its last location between tests.
    },
    { initialUrl: "/" },
  );
};
const tipDay = (over: Partial<TipOfTheDay["tip"] & object> | null = {}): TipOfTheDay => ({
  date: "2026-11-22",
  tip:
    over === null
      ? null
      : {
          id: "t1",
          category: "risk_management",
          body: "Protecting your capital matters more than chasing quick profits.",
          courseId: null,
          courseTitle: null,
          ...over,
        },
});

beforeEach(() => {
  jest.restoreAllMocks();
});

describe("Tip of the Day card", () => {
  it("shows today's stored tip with its day and category, and one spoken summary", async () => {
    jest.spyOn(tipApi, "today").mockResolvedValue(tipDay());
    await mount(<TipOfTheDayCard />);
    expect(
      await screen.findByText("Protecting your capital matters more than chasing quick profits."),
    ).toBeTruthy();
    expect(screen.getByText("Tip of the Day")).toBeTruthy();
    expect(screen.getByText(`${dayLabel("2026-11-22")} · Risk management`)).toBeTruthy();
    expect(screen.getByText("Educational only. Not financial advice.")).toBeTruthy();
    expect(screen.getByTestId("tip-of-the-day").props.accessibilityLabel).toContain(
      "Risk management. Protecting your capital",
    );
    expect(screen.queryByText("Learn more")).toBeNull();
  });

  it("offers Learn more only when a course is linked, and opens that course", async () => {
    jest
      .spyOn(tipApi, "today")
      .mockResolvedValue(tipDay({ courseId: "c9", courseTitle: "Risk Basics" }));
    await mount(<TipOfTheDayCard />, { "course/[id]": () => <Text>course page</Text> });
    await fireEvent.press(await screen.findByText("Learn more"));
    expect(screen).toHavePathname("/course/c9");
  });

  it("takes no room when there is no tip, so Home is never blocked", async () => {
    jest.spyOn(tipApi, "today").mockResolvedValue(tipDay(null));
    await mount(<TipOfTheDayCard />);
    await waitFor(() => expect(screen.queryByTestId("tip-loading")).toBeNull());
    expect(screen.queryByTestId("tip-of-the-day")).toBeNull();
  });

  it("takes no room when the request fails", async () => {
    jest.spyOn(tipApi, "today").mockRejectedValue(appError("unknown"));
    await mount(<TipOfTheDayCard />);
    await waitFor(() => expect(screen.queryByTestId("tip-loading")).toBeNull());
    expect(screen.queryByTestId("tip-of-the-day")).toBeNull();
  });
});

const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["announcements:publish"],
  courseGrants: [],
};
const tip = (over: Partial<StaffTip> = {}): StaffTip => ({
  id: "t1",
  category: "market_basics",
  body: "A chart pattern is a possibility, not a guarantee.",
  courseId: null,
  courseTitle: null,
  status: "active",
  createdAt: "2026-11-20T00:00:00.000Z",
  archivedAt: null,
  ...over,
});

describe("managing tips", () => {
  beforeEach(() => {
    access.mockResolvedValue(MANAGER);
    jest.spyOn(staffCourseApi, "list").mockResolvedValue({ items: [], nextCursor: null } as never);
  });

  it("refuses people without the permission", async () => {
    access.mockResolvedValue({
      roles: ["student"],
      permissions: [],
      courseGrants: [],
    });
    const list = jest.spyOn(staffTipApi, "list").mockResolvedValue([]);
    await mount(<StaffTipsScreen />);
    expect(await screen.findByText("Only Admins and Managers can manage tips.")).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
  });

  it("lists tips and archives an active one", async () => {
    jest
      .spyOn(staffTipApi, "list")
      .mockResolvedValue([
        tip(),
        tip({ id: "t2", status: "archived", body: "Old tip that was retired." }),
      ]);
    const archive = jest
      .spyOn(staffTipApi, "archive")
      .mockResolvedValue(tip({ status: "archived" }));
    await mount(<StaffTipsScreen />);
    expect(await screen.findByText("1 active.", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("Archived")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: /Archive tip: A chart pattern/ }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith("t1"));
  });

  it("adds a tip only when the length is valid, and sends the chosen category", async () => {
    jest.spyOn(staffTipApi, "list").mockResolvedValue([]);
    const create = jest.spyOn(staffTipApi, "create").mockResolvedValue(tip());
    await mount(<StaffTipsScreen />);
    await screen.findByText("No tips yet");
    const add = screen.getByRole("button", { name: "Add tip" });
    expect(add.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Trading psychology" }));
    await fireEvent.changeText(
      screen.getByLabelText("Tip"),
      "Plan the trade before emotions arrive.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Add tip" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        category: "trading_psychology",
        body: "Plan the trade before emotions arrive.",
      }),
    );
  });

  it("shows a server refusal and keeps what was typed", async () => {
    jest.spyOn(staffTipApi, "list").mockResolvedValue([]);
    jest.spyOn(staffTipApi, "create").mockRejectedValue(appError("server"));
    await mount(<StaffTipsScreen />);
    await screen.findByText("No tips yet");
    await fireEvent.changeText(screen.getByLabelText("Tip"), "A valid tip with enough length.");
    await fireEvent.press(screen.getByRole("button", { name: "Add tip" }));
    expect(await screen.findByTestId("tip-error")).toBeTruthy();
    expect(screen.getByLabelText("Tip").props.value).toBe("A valid tip with enough length.");
  });
});
