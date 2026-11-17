import { act, cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import {
  clearScreenMemory,
  useRestorableScroll,
  useScreenMemoryState,
} from "../src/navigation/screen-memory";
import { sessionStore } from "../src/session/session-store";

type Handles = ReturnType<typeof useRestorableScroll>["props"];
let handles: Handles | null = null;

/** A stand-in list: it exposes the scroll handlers a real ScrollView would call. */
function List({ id, scrollTo }: { id: string; scrollTo: jest.Mock }) {
  const scroll = useRestorableScroll(`list:${id}`);
  const [filter, setFilter] = useScreenMemoryState<string>(`filter:${id}`, "all");
  scroll.ref.current = { scrollTo };
  handles = scroll.props;
  return (
    <Pressable testID={`filter-${id}`} onPress={() => setFilter("even")}>
      <Text testID={`filter-label-${id}`}>{filter}</Text>
    </Pressable>
  );
}

const scrollEvent = (y: number) => ({ nativeEvent: { contentOffset: { y } } }) as never;

beforeEach(() => {
  clearScreenMemory();
  handles = null;
});
afterEach(async () => {
  await cleanup();
});

describe("remembered list position", () => {
  it("restores scroll offset and filter after leaving and returning", async () => {
    const first = await render(<List id="a" scrollTo={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("filter-a"));
    await act(async () => handles?.onScroll(scrollEvent(320)));
    await first.unmount();

    const again = jest.fn();
    await render(<List id="a" scrollTo={again} />);
    expect(screen.getByTestId("filter-label-a").props.children).toBe("even");
    await act(async () => handles?.onContentSizeChange?.());
    expect(again).toHaveBeenCalledWith({ y: 320, animated: false });
  });

  it("restores only once, so later layout changes do not fight the user's scrolling", async () => {
    const first = await render(<List id="a" scrollTo={jest.fn()} />);
    await act(async () => handles?.onScroll(scrollEvent(150)));
    await first.unmount();

    const again = jest.fn();
    await render(<List id="a" scrollTo={again} />);
    await act(async () => handles?.onContentSizeChange?.());
    await act(async () => handles?.onContentSizeChange?.());
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("does not leak position or filters into a different list", async () => {
    const a = await render(<List id="a" scrollTo={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("filter-a"));
    await act(async () => handles?.onScroll(scrollEvent(500)));
    await a.unmount();

    const b = jest.fn();
    await render(<List id="b" scrollTo={b} />);
    expect(screen.getByTestId("filter-label-b").props.children).toBe("all");
    await act(async () => handles?.onContentSizeChange?.());
    expect(b).not.toHaveBeenCalled();
  });

  it("clears remembered state on sign-out", async () => {
    sessionStore.set("signed-in");
    const a = await render(<List id="a" scrollTo={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("filter-a"));
    await act(async () => handles?.onScroll(scrollEvent(200)));
    await a.unmount();
    sessionStore.set("signed-out");

    const again = jest.fn();
    await render(<List id="a" scrollTo={again} />);
    expect(screen.getByTestId("filter-label-a").props.children).toBe("all");
    await act(async () => handles?.onContentSizeChange?.());
    expect(again).not.toHaveBeenCalled();
  });
});
