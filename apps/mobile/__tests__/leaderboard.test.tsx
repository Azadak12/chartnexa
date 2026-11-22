import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Leaderboard } from "@chartnexa/api-contracts";
import { myCoursesApi } from "../src/entitlements/entitlement-api";
import { leaderboardApi } from "../src/leaderboard/leaderboard-api";
import { LeaderboardScreen } from "../src/leaderboard/LeaderboardScreen";
import { initials, Podium } from "../src/leaderboard/Podium";
import { appError } from "../test-utils/auth-mocks";

const mount = async (element: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRouter({
    _layout: () => {
      const { Slot } = jest.requireActual("expo-router");
      return (
        <QueryClientProvider client={client}>
          <Slot />
        </QueryClientProvider>
      );
    },
    index: () => element,
  });
};
const e = (rank: number, displayName: string, completedLessons: number, isMe = false) => ({
  rank,
  displayName,
  completedLessons,
  isMe,
});
const board = (over: Partial<Leaderboard> = {}): Leaderboard => ({
  period: "weekly",
  since: "2026-11-16T00:00:00.000Z",
  courseId: null,
  entries: [e(1, "Ann Lee", 6), e(2, "Bo Chen", 4), e(2, "Cy Park", 4), e(4, "Di Ray", 1, true)],
  me: { optedIn: true, rank: 4, completedLessons: 1 },
  ...over,
});

let spy: jest.SpyInstance;
beforeEach(() => {
  jest.restoreAllMocks();
  spy = jest.spyOn(leaderboardApi, "board").mockResolvedValue(board());
  jest.spyOn(myCoursesApi, "list").mockResolvedValue({
    items: [
      { id: "c1", title: "Price Action", onSale: true },
      { id: "c2", title: "Withdrawn", onSale: false },
    ],
    nextCursor: null,
  } as never);
});

describe("Podium", () => {
  it("builds initials from a public name", () => {
    expect(initials("Ann Lee")).toBe("AL");
    expect(initials("  bo ")).toBe("B");
    expect(initials("")).toBe("?");
  });
  it("describes each step in words so animation is never needed", async () => {
    await mount(<Podium entries={board().entries} />);
    expect(screen.getByLabelText("Rank 1, Ann Lee, 6 lessons completed")).toBeTruthy();
    expect(screen.getByLabelText("Rank 2, Bo Chen, 4 lessons completed")).toBeTruthy();
    expect(screen.getByLabelText("Rank 2, Cy Park, 4 lessons completed")).toBeTruthy();
    expect(screen.queryByLabelText(/Di Ray/)).toBeNull();
  });
  it("renders nothing without entries and copes with fewer than three", async () => {
    await mount(<Podium entries={[]} />);
    expect(screen.queryByTestId("podium")).toBeNull();
  });
});

describe("Learners Leaderboard", () => {
  it("shows the podium for the top three, the rest as rows, and highlights you", async () => {
    await mount(<LeaderboardScreen />);
    expect(await screen.findByTestId("podium")).toBeTruthy();
    const row = screen.getByLabelText("Rank 4, you, Di Ray, 1 lesson completed");
    expect(row).toBeTruthy();
    expect(screen.getByText("You are ranked 4 with 1 lesson.")).toBeTruthy();
    expect(screen.queryByTestId("join-card")).toBeNull();
    expect(screen.getByText(/Quizzes, mistakes\s+and trading never count/)).toBeTruthy();
  });

  it("asks for the week by default and reloads for month, all time and a course", async () => {
    await mount(<LeaderboardScreen />);
    await screen.findByTestId("podium");
    expect(spy).toHaveBeenLastCalledWith("weekly", undefined);
    await fireEvent.press(screen.getByRole("button", { name: "Month" }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith("monthly", undefined));
    await fireEvent.press(screen.getByRole("button", { name: "Price Action" }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith("monthly", "c1"));
    expect(screen.queryByRole("button", { name: "Withdrawn" })).toBeNull();
  });

  it("invites someone who has not joined, and joining reloads the board", async () => {
    spy.mockResolvedValueOnce(
      board({ me: { optedIn: false, rank: null, completedLessons: null } }),
    );
    const join = jest.spyOn(leaderboardApi, "setOptIn").mockResolvedValue({ optedIn: true });
    await mount(<LeaderboardScreen />);
    expect(await screen.findByTestId("join-card")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Join the leaderboard" }));
    await waitFor(() => expect(join).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.queryByTestId("join-card")).toBeNull());
  });

  it("explains that a display name is needed when joining is refused", async () => {
    spy.mockResolvedValue(board({ me: { optedIn: false, rank: null, completedLessons: null } }));
    jest.spyOn(leaderboardApi, "setOptIn").mockRejectedValue(appError("conflict"));
    await mount(<LeaderboardScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Join the leaderboard" }));
    expect(await screen.findByText(/Add a display name in your profile first/)).toBeTruthy();
  });

  it("lets you leave", async () => {
    const leave = jest.spyOn(leaderboardApi, "setOptIn").mockResolvedValue({ optedIn: false });
    await mount(<LeaderboardScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith(false));
  });

  it("pins your own rank when you are outside the listed entries", async () => {
    spy.mockResolvedValue(
      board({
        entries: [e(1, "Ann Lee", 6), e(2, "Bo Chen", 4), e(3, "Cy Park", 3), e(4, "Di Ray", 2)],
        me: { optedIn: true, rank: 77, completedLessons: 1 },
      }),
    );
    await mount(<LeaderboardScreen />);
    expect(await screen.findByLabelText("Rank 77, you, You, 1 lesson completed")).toBeTruthy();
  });

  it("has an empty state, a loading state and a retryable error state", async () => {
    spy.mockResolvedValueOnce(
      board({ entries: [], me: { optedIn: true, rank: null, completedLessons: null } }),
    );
    const first = await mount(<LeaderboardScreen />);
    expect(await screen.findByText("No one is ranked yet")).toBeTruthy();
    expect(screen.getByText("Complete a lesson to get a rank for this view.")).toBeTruthy();
    first.unmount();
    spy.mockRejectedValueOnce(appError("unknown")).mockResolvedValue(board());
    await mount(<LeaderboardScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByTestId("podium")).toBeTruthy();
  });
});
