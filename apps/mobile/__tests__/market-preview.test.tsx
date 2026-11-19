import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { AccessibilityInfo, Text } from "react-native";
import {
  candleLine,
  MarketPreviewCard,
  PREVIEW_CANDLES,
  previewCandles,
  REVEAL_STEP_MS,
} from "../src/lab/MarketPreviewCard";

const mount = () =>
  renderRouter({
    index: MarketPreviewCard,
    lab: () => <Text>Lab screen</Text>,
    other: () => <Text>Other</Text>,
  });
const reduceMotion = (v: boolean) =>
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(v);
const layout = () =>
  fireEvent(screen.getByTestId("preview-chart"), "layout", {
    nativeEvent: { layout: { width: 300, height: 84 } },
  });

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("the sequence", () => {
  it("is twelve valid simulated candles with consistent open, high, low and close", () => {
    const c = previewCandles();
    expect(c).toHaveLength(PREVIEW_CANDLES);
    for (const k of c) {
      expect(k.high).toBeGreaterThanOrEqual(Math.max(k.open, k.close));
      expect(k.low).toBeLessThanOrEqual(Math.min(k.open, k.close));
    }
    expect(previewCandles()).toEqual(c);
  });

  it("names direction in words as well as with an arrow", () => {
    expect(candleLine({ open: 100, high: 105, low: 99, close: 103 } as never)).toBe(
      "▲ Bullish: opened 100.00, closed 103.00",
    );
    expect(candleLine({ open: 100, high: 101, low: 95, close: 96 } as never)).toBe(
      "▼ Bearish: opened 100.00, closed 96.00",
    );
  });
});

describe("the card", () => {
  it("is compact: a header, a short chart, one line of text and one action, labelled simulated", async () => {
    reduceMotion(true);
    await mount();
    expect(await screen.findByText("Market Learning Preview")).toBeTruthy();
    expect(screen.getByLabelText("Simulated data, not a live market")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Explore Learning Lab" })).toBeTruthy();
    // No timeframe, zoom or level controls on Home: those live in the Learning Lab.
    for (const n of ["Zoom in", "Zoom out", "1 day candles"]) {
      expect(screen.queryByLabelText(n)).toBeNull();
    }
  });

  it("shows every candle at once when the system asks for reduced motion, and names a tapped one", async () => {
    reduceMotion(true);
    await mount();
    await screen.findByText("Market Learning Preview");
    await layout();
    expect(await screen.findByTestId(`preview-candle-${PREVIEW_CANDLES - 1}`)).toBeTruthy();
    expect(screen.getByTestId("preview-readout").props.children).toBe(
      "Tap a candle to see how it formed.",
    );
    await fireEvent.press(screen.getByTestId("preview-candle-3"));
    expect(screen.getByTestId("preview-readout").props.children).toMatch(
      /^(▲ Bullish|▼ Bearish): opened \d+\.\d{2}, closed \d+\.\d{2}$/,
    );
  });

  it("reveals the candles gradually, then stops its timer, and does not run while another screen is on top", async () => {
    jest.useFakeTimers();
    reduceMotion(false);
    await mount();
    await act(async () => {
      await Promise.resolve();
    });
    await layout();
    const idle = jest.getTimerCount() - 1; // everything except the reveal timer
    expect(screen.queryByTestId("preview-candle-0")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(REVEAL_STEP_MS * 3);
    });
    expect(screen.getByTestId("preview-candle-0")).toBeTruthy();
    expect(screen.queryByTestId("preview-candle-6")).toBeNull();

    // Leaving the screen clears the reveal timer; nothing keeps drawing in the background.
    const { router } = require("expo-router");
    await act(async () => router.push("/other"));
    expect(jest.getTimerCount()).toBeLessThanOrEqual(idle);

    // Coming back and finishing leaves no timer behind: the sequence never loops.
    await act(async () => router.back());
    await layout();
    await act(async () => {
      jest.advanceTimersByTime(REVEAL_STEP_MS * 30);
    });
    expect(screen.getByTestId("preview-candle-11")).toBeTruthy();
    expect(jest.getTimerCount()).toBeLessThanOrEqual(idle);
  });

  it("opens the Learning Lab", async () => {
    reduceMotion(true);
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "Explore Learning Lab" }));
    expect(screen).toHavePathname("/lab");
  });
});
