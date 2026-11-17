import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { AppError } from "../src/api/errors";
import { OfflineBanner } from "../src/state/OfflineBanner";
import { QueryStateView, StateView } from "../src/state/StateView";
import { Screen } from "../src/ui";

const netinfo = jest.requireMock("@react-native-community/netinfo") as {
  __setConnected: (v: boolean) => void;
};

type Q = Parameters<typeof QueryStateView<string[]>>[0]["query"];
const query = (over: Partial<Q>): Q => ({
  status: "success",
  data: ["a"],
  error: null,
  refetch: jest.fn(),
  ...over,
});

describe("StateView", () => {
  it("shows a skeleton while loading, not a blank screen", async () => {
    await render(<StateView state="loading" />);
    expect(screen.getByTestId("state-loading")).toBeTruthy();
    expect(
      screen.getAllByTestId("skeleton", { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  it("explains an empty result and offers the next action", async () => {
    const next = jest.fn();
    await render(
      <StateView
        state="empty"
        title="No courses yet"
        message="Buy one."
        actionLabel="Browse"
        onAction={next}
      />,
    );
    expect(screen.getByText("No courses yet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Browse" }));
    expect(next).toHaveBeenCalled();
  });

  it("shows a support reference in small print", async () => {
    await render(<StateView state="error" requestId="req-12345678" onAction={() => undefined} />);
    expect(screen.getByTestId("support-reference").props.children.join("")).toContain(
      "req-12345678",
    );
  });
});

describe("QueryStateView", () => {
  const render2 = (q: Q, extra: Partial<Parameters<typeof QueryStateView<string[]>>[0]> = {}) =>
    render(
      <QueryStateView query={q} isEmpty={(d) => d.length === 0} {...extra}>
        {(d) => <Text>{`items: ${d.length}`}</Text>}
      </QueryStateView>,
    );

  it("renders exactly one state at a time", async () => {
    await render2(query({ status: "pending", data: undefined }));
    expect(screen.getByTestId("state-loading")).toBeTruthy();
    expect(screen.queryByText(/items/)).toBeNull();
  });

  it("shows content on success and the empty state for no items", async () => {
    const { unmount } = await render2(query({}));
    expect(screen.getByText("items: 1")).toBeTruthy();
    await unmount();
    await render2(query({ data: [] }), { emptyTitle: "Nothing yet" });
    expect(screen.getByTestId("state-empty")).toBeTruthy();
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });

  it("shows a friendly error with a working Retry that repeats the request", async () => {
    const refetch = jest.fn();
    const err = new AppError(
      "server",
      "Something went wrong on our side. Please try again.",
      500,
      "req-87654321",
    );
    await render2(query({ status: "error", data: undefined, error: err, refetch }));
    expect(screen.getByText("Something went wrong on our side. Please try again.")).toBeTruthy();
    expect(screen.getByTestId("support-reference")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the offline state for a network failure and the unauthorized state with sign-in for a 401", async () => {
    const refetch = jest.fn();
    const { unmount } = await render2(
      query({
        status: "error",
        data: undefined,
        error: new AppError("network", "x", null, "app-1"),
        refetch,
      }),
    );
    expect(screen.getByTestId("state-offline")).toBeTruthy();
    await unmount();

    const signIn = jest.fn();
    await render2(
      query({
        status: "error",
        data: undefined,
        error: new AppError("unauthorized", "x", 401, "r1"),
      }),
      { onSignIn: signIn },
    );
    expect(screen.getByTestId("state-unauthorized")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(signIn).toHaveBeenCalled();
  });

  it("falls back to a generic message for an unknown error value and never prints it", async () => {
    await render2(query({ status: "error", data: undefined, error: "raw <html> stack trace" }));
    expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/stack trace/)).toBeNull();
  });
});

describe("OfflineBanner", () => {
  afterEach(() => act(async () => netinfo.__setConnected(true)));

  it("appears when the connection is lost, keeps content visible, and disappears when it returns", async () => {
    await render(
      <Screen>
        <Text>already loaded</Text>
      </Screen>,
    );
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    await act(async () => netinfo.__setConnected(false));
    expect(screen.getByTestId("offline-banner")).toBeTruthy();
    expect(screen.getByText("already loaded")).toBeTruthy();
    await act(async () => netinfo.__setConnected(true));
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    expect(screen.getByText("already loaded")).toBeTruthy();
  });

  it("uses a warning banner with an icon and text label", async () => {
    await act(async () => netinfo.__setConnected(false));
    await render(<OfflineBanner />);
    expect(screen.getByTestId("offline-banner").props.accessibilityLabel).toMatch(
      /^Warning: You are offline/,
    );
  });
});
