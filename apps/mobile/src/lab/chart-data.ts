/**
 * Educational chart data. Everything here is SIMULATED: a seeded random walk, never a market
 * feed, and the app always says so. Timeframes are real aggregations of one base series (hourly
 * candles), so a daily candle really is the open of its first hour, the highest high, the lowest
 * low and the close of its last hour.
 */
export interface Candle {
  /** Hours since the start of the series (used for labels). */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Timeframe = "1H" | "4H" | "1D";
export const TIMEFRAMES: readonly Timeframe[] = ["1H", "4H", "1D"];
/** How many base (hourly) candles make one candle of each timeframe. */
export const HOURS_PER: Record<Timeframe, number> = { "1H": 1, "4H": 4, "1D": 24 };
export const TIMEFRAME_NAME: Record<Timeframe, string> = {
  "1H": "1 hour",
  "4H": "4 hours",
  "1D": "1 day",
};

/** A small deterministic generator, so the same series appears on every device and in tests. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** `count` hourly candles of a random walk with a gentle drift. */
export function simulatedSeries(seed = 7, count = 240, start = 100): Candle[] {
  const rand = seeded(seed);
  const out: Candle[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    const open = price;
    // Slow waves give the series trends and pullbacks instead of pure noise.
    const wave = Math.sin(i / 17) * 0.12 + Math.sin(i / 5) * 0.05;
    const close = Math.max(5, open + (rand() - 0.5) * 1.6 + wave);
    const high = Math.max(open, close) + rand() * 0.7;
    const low = Math.max(1, Math.min(open, close) - rand() * 0.7);
    out.push({ t: i, open: round(open), high: round(high), low: round(low), close: round(close) });
    price = close;
  }
  return out;
}

/** Joins every `n` candles into one: first open, highest high, lowest low, last close. */
export function aggregate(candles: readonly Candle[], n: number): Candle[] {
  if (n <= 1) return [...candles];
  const out: Candle[] = [];
  for (let i = 0; i + n <= candles.length; i += n) {
    const group = candles.slice(i, i + n);
    const first = group[0] as Candle;
    const last = group[group.length - 1] as Candle;
    out.push({
      t: first.t,
      open: first.open,
      high: round(Math.max(...group.map((c) => c.high))),
      low: round(Math.min(...group.map((c) => c.low))),
      close: last.close,
    });
  }
  return out;
}

export const forTimeframe = (base: readonly Candle[], tf: Timeframe): Candle[] =>
  aggregate(base, HOURS_PER[tf]);

/** Simple moving average of closes; null until there are enough candles. */
export function sma(candles: readonly Candle[], period: number): (number | null)[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let k = i - period + 1; k <= i; k++) sum += (candles[k] as Candle).close;
    return round(sum / period);
  });
}

/**
 * Example support and resistance: the lowest swing low and highest swing high among local
 * turning points. Taught as an example of the idea, not as a trading signal.
 */
export function exampleLevels(
  candles: readonly Candle[],
  window = 3,
): { support: number | null; resistance: number | null } {
  let support: number | null = null;
  let resistance: number | null = null;
  for (let i = window; i < candles.length - window; i++) {
    const c = candles[i] as Candle;
    const around = candles.slice(i - window, i + window + 1);
    if (around.every((x) => x.low >= c.low))
      support = support === null ? c.low : Math.min(support, c.low);
    if (around.every((x) => x.high <= c.high))
      resistance = resistance === null ? c.high : Math.max(resistance, c.high);
  }
  return { support, resistance };
}

export type Direction = "bullish" | "bearish" | "doji";

export function directionOf(c: Candle, dojiBody = 0.03): Direction {
  const body = Math.abs(c.close - c.open);
  if (body <= dojiBody) return "doji";
  return c.close > c.open ? "bullish" : "bearish";
}

export interface CandleReading {
  direction: Direction;
  change: number;
  /** One or two plain sentences with the actual numbers. */
  text: string;
}

const fmt = (n: number) => n.toFixed(2);

/** Explains a candle from its own four prices. */
export function describeCandle(c: Candle): CandleReading {
  const direction = directionOf(c);
  const change = round(c.close - c.open);
  const range = fmt(c.high - c.low);
  const upper = fmt(c.high - Math.max(c.open, c.close));
  const lower = fmt(Math.min(c.open, c.close) - c.low);
  const head =
    direction === "bullish"
      ? `It opened at ${fmt(c.open)} and closed at ${fmt(c.close)}, higher than it opened, so it is bullish (up ${fmt(change)}).`
      : direction === "bearish"
        ? `It opened at ${fmt(c.open)} and closed at ${fmt(c.close)}, lower than it opened, so it is bearish (down ${fmt(Math.abs(change))}).`
        : `It opened at ${fmt(c.open)} and closed at ${fmt(c.close)}, almost the same, so it shows indecision (a doji).`;
  return {
    direction,
    change,
    text: `${head} Price travelled ${range} from low to high; the upper wick is ${upper} and the lower wick is ${lower}.`,
  };
}

/** Indexes of candles clear enough to ask about (a visible body, not a doji). */
export function quizCandidates(candles: readonly Candle[], minBody = 0.25): number[] {
  const out: number[] = [];
  candles.forEach((c, i) => {
    if (Math.abs(c.close - c.open) >= minBody) out.push(i);
  });
  return out;
}

/** The label shown on every chart. Never remove it. */
export const SIMULATED_LABEL = "Simulated educational data. Not a live market.";
