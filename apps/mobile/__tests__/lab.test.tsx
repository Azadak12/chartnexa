import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { CandleQuiz, pickCandle } from "../src/lab/CandleQuiz";
import { ChartCard } from "../src/lab/ChartCard";
import {
  aggregate,
  describeCandle,
  directionOf,
  exampleLevels,
  forTimeframe,
  quizCandidates,
  simulatedSeries,
  sma,
  type Candle,
} from "../src/lab/chart-data";

const base = simulatedSeries(7);
const c = (open: number, high: number, low: number, close: number, t = 0): Candle => ({
  t,
  open,
  high,
  low,
  close,
});

describe("chart data", () => {
  it("is the same on every run and every device", () => {
    expect(simulatedSeries(7)).toEqual(simulatedSeries(7));
    expect(simulatedSeries(7)).not.toEqual(simulatedSeries(8));
  });

  it("keeps every candle valid: high is the top, low is the bottom", () => {
    for (const k of base) {
      expect(k.high).toBeGreaterThanOrEqual(Math.max(k.open, k.close));
      expect(k.low).toBeLessThanOrEqual(Math.min(k.open, k.close));
      expect(k.low).toBeGreaterThan(0);
    }
  });

  it("aggregates by the real rule, so a timeframe is not a relabelled copy", () => {
    const group = [c(10, 12, 9, 11), c(11, 15, 10, 14), c(14, 14.5, 8, 9), c(9, 13, 8.5, 12)];
    expect(aggregate(group, 4)).toEqual([{ t: 0, open: 10, high: 15, low: 8, close: 12 }]);
    const four = forTimeframe(base, "4H");
    const day = forTimeframe(base, "1D");
    expect(four).toHaveLength(base.length / 4);
    expect(day).toHaveLength(base.length / 24);
    expect(forTimeframe(base, "1H")).toEqual(base);
    // Check one daily candle against its 24 hourly candles.
    const hours = base.slice(24, 48);
    expect(day[1]).toEqual({
      t: 24,
      open: hours[0]!.open,
      high: Math.max(...hours.map((x) => x.high)),
      low: Math.min(...hours.map((x) => x.low)),
      close: hours[23]!.close,
    });
    // The overall range is preserved, the number of candles is not.
    expect(Math.max(...day.map((x) => x.high))).toBe(Math.max(...base.map((x) => x.high)));
    expect(Math.min(...day.map((x) => x.low))).toBe(Math.min(...base.map((x) => x.low)));
  });

  it("computes moving averages from closes", () => {
    const flat = [c(1, 2, 0.5, 2), c(2, 3, 1, 3), c(3, 4, 2, 4)];
    expect(sma(flat, 2)).toEqual([null, 2.5, 3.5]);
    expect(sma(flat, 5)).toEqual([null, null, null]);
  });

  it("finds example levels at turning points", () => {
    const w = [
      c(5, 6, 4, 5),
      c(5, 6, 4, 5),
      c(5, 6, 4, 5),
      c(5, 9, 3, 5),
      c(5, 6, 4, 5),
      c(5, 6, 4, 5),
      c(5, 6, 4, 5),
    ];
    expect(exampleLevels(w)).toEqual({ support: 3, resistance: 9 });
    expect(exampleLevels([c(1, 2, 0, 1)])).toEqual({ support: null, resistance: null });
  });

  it("classifies candles from their own prices and explains them with the numbers", () => {
    expect(directionOf(c(10, 12, 9, 11.5))).toBe("bullish");
    expect(directionOf(c(10, 12, 9, 9.4))).toBe("bearish");
    expect(directionOf(c(10, 11, 9, 10.01))).toBe("doji");
    expect(describeCandle(c(10, 12, 9, 11.5)).text).toContain(
      "opened at 10.00 and closed at 11.50",
    );
    expect(describeCandle(c(10, 12, 9, 9.4)).text).toContain("bearish (down 0.60)");
    expect(quizCandidates([c(10, 11, 9, 10.1), c(10, 12, 9, 11)])).toEqual([1]);
  });
});

describe("the chart card", () => {
  it("says it is simulated, and shows the selected candle's open, high, low and close", async () => {
    await render(<ChartCard />);
    expect(screen.getByTestId("chart-disclaimer").props.children).toMatch(
      /Simulated educational data/,
    );
    expect(screen.getByTestId("chart-badge").props.children).toBe("Simulated");
    expect(screen.getByTestId("ohlc-values").props.children.join("")).toMatch(
      /O \d+\.\d+ +H \d+\.\d+ +L \d+\.\d+ +C \d+\.\d+/,
    );
  });

  it("changes the data, not just the label, when the timeframe changes", async () => {
    await render(<ChartCard initialTimeframe="1H" />);
    const count = () =>
      screen
        .getByTestId("ohlc-title")
        .props.children.join("")
        .match(/of (\d+)/)![1];
    expect(count()).toBe("240");
    await fireEvent.press(screen.getByTestId("tf-4H"));
    await fireEvent.press(screen.getByTestId("next-candle"));
    await fireEvent.press(screen.getByTestId("prev-candle"));
    expect(count()).toBe("60");
    await fireEvent.press(screen.getByTestId("tf-1D"));
    await fireEvent.press(screen.getByTestId("prev-candle"));
    expect(count()).toBe("10");
    expect(screen.getByTestId("tf-1D").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("tf-4H").props.accessibilityState.selected).toBe(false);
  });

  it("lets you inspect a tapped candle and step through neighbours", async () => {
    await render(<ChartCard initialTimeframe="1D" />);
    await fireEvent.press(screen.getByTestId("candle-3"));
    expect(screen.getByTestId("ohlc-title").props.children.join("")).toContain("Candle 4 of 10");
    const d = forTimeframe(base, "1D")[3]!;
    expect(screen.getByTestId("ohlc-values").props.children.join("")).toContain(
      `O ${d.open.toFixed(2)}`,
    );
    await fireEvent.press(screen.getByTestId("next-candle"));
    expect(screen.getByTestId("ohlc-title").props.children.join("")).toContain("Candle 5 of 10");
    await fireEvent.press(screen.getByTestId("prev-candle"));
    await fireEvent.press(screen.getByTestId("prev-candle"));
    expect(screen.getByTestId("ohlc-title").props.children.join("")).toContain("Candle 3 of 10");
  });

  it("has accessible zoom controls that stop at their limits, and optional overlays", async () => {
    await render(<ChartCard />);
    const out = () => screen.getByTestId("zoom-out").props.accessibilityState.disabled;
    expect(out()).toBe(false);
    await fireEvent.press(screen.getByTestId("zoom-out"));
    await fireEvent.press(screen.getByTestId("zoom-out"));
    expect(out()).toBe(true);
    for (let i = 0; i < 4; i++) await fireEvent.press(screen.getByTestId("zoom-in"));
    expect(screen.getByTestId("zoom-in").props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId("toggle-averages"));
    expect(screen.getByTestId("toggle-averages").props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId("toggle-levels"));
    expect(screen.getByTestId("toggle-levels").props.accessibilityState.selected).toBe(true);
  });

  it("hides the extra toggles in the compact dashboard version", async () => {
    await render(<ChartCard compact />);
    expect(screen.queryByTestId("toggle-averages")).toBeNull();
    expect(screen.getByTestId("tf-1D")).toBeTruthy();
  });
});

describe("the bullish or bearish exercise", () => {
  const seedCandles = () => forTimeframe(simulatedSeries(11), "4H").slice(-40);

  it("asks about a clear candle and chooses a different one each time", () => {
    const candles = seedCandles();
    const picks = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((n) => pickCandle(candles, n, 11)));
    expect(picks.size).toBeGreaterThan(2);
    for (const i of picks)
      expect(Math.abs(candles[i]!.close - candles[i]!.open)).toBeGreaterThanOrEqual(0.25);
  });

  it("marks a right answer correct and a wrong answer incorrect, with the open and close", async () => {
    await render(<CandleQuiz seed={11} />);
    const q = screen.getByTestId("quiz-question").props.children.join("");
    const n = Number(/number (\d+)/.exec(q)![1]);
    const truth = describeCandle(seedCandles()[n - 1]!).direction;
    const right = truth === "bullish" ? "Answer: bullish" : "Answer: bearish";
    const wrong = truth === "bullish" ? "Answer: bearish" : "Answer: bullish";
    await fireEvent.press(screen.getByRole("button", { name: wrong }));
    const fb = screen.getByTestId("quiz-feedback");
    expect(within(fb).getByText(/Not quite/)).toBeTruthy();
    expect(
      within(fb).getByText(new RegExp(`opened at ${seedCandles()[n - 1]!.open.toFixed(2)}`)),
    ).toBeTruthy();
    expect(screen.getByTestId("quiz-score").props.children.join("")).toContain("0 of 1");
    // Answers are locked until another candle is chosen.
    expect(screen.getByRole("button", { name: right }).props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Try another candle" }));
    expect(screen.queryByTestId("quiz-feedback")).toBeNull();
    const q2 = screen.getByTestId("quiz-question").props.children.join("");
    const n2 = Number(/number (\d+)/.exec(q2)![1]);
    const truth2 = describeCandle(seedCandles()[n2 - 1]!).direction;
    await fireEvent.press(
      screen.getByRole("button", {
        name: truth2 === "bullish" ? "Answer: bullish" : "Answer: bearish",
      }),
    );
    expect(within(screen.getByTestId("quiz-feedback")).getByText(/Correct/)).toBeTruthy();
    expect(screen.getByTestId("quiz-score").props.children.join("")).toContain("1 of 2");
  });

  it("reports each result", async () => {
    const onResult = jest.fn();
    await render(<CandleQuiz seed={11} onResult={onResult} />);
    await fireEvent.press(screen.getByRole("button", { name: "Answer: bullish" }));
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(typeof onResult.mock.calls[0][0]).toBe("boolean");
  });
});
