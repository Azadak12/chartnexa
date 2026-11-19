/**
 * Lessons about charts get a link to the Learning Lab. This is a plain keyword match on the real
 * lesson text; no lesson is changed and nothing is claimed about the lesson beyond its own words.
 */
const CHART_WORDS =
  /\b(candle|candlestick|candlesticks|chart|charts|support|resistance|trend|trends|moving average|price action|ohlc)\b/i;

export function relatedToChartLab(title: string, body?: string | null): boolean {
  return CHART_WORDS.test(title) || CHART_WORDS.test(body ?? "");
}
