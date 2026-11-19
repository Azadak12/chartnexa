import { useMemo, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { market, neutrals, radii, spacing, status } from "../theme";
import { Button, Text } from "../ui";
import {
  describeCandle,
  forTimeframe,
  quizCandidates,
  seeded,
  simulatedSeries,
  SIMULATED_LABEL,
  type Candle,
} from "./chart-data";
import { InteractiveCandlestickChart } from "./InteractiveCandlestickChart";

/** The index to ask about on attempt `n`: different each time, always a clear candle. */
export function pickCandle(candles: readonly Candle[], attempt: number, seed: number): number {
  const pool = quizCandidates(candles);
  if (pool.length === 0) return 0;
  const r = seeded(seed + attempt * 7919)();
  return pool[Math.floor(r * pool.length)] as number;
}

/**
 * Exercise: "Is the highlighted candle bullish or bearish?" The answer is checked from the
 * candle's own open and close, the feedback shows both numbers, and another candle can be tried.
 */
export function CandleQuiz({
  seed = 11,
  onResult,
}: {
  seed?: number;
  onResult?: (correct: boolean) => void;
}) {
  const candles = useMemo(() => forTimeframe(simulatedSeries(seed), "4H").slice(-40), [seed]);
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<"bullish" | "bearish" | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const index = useMemo(() => pickCandle(candles, attempt, seed), [candles, attempt, seed]);
  const candle = candles[index] as Candle;
  const truth = describeCandle(candle);
  const correct = answer !== null && answer === truth.direction;

  const choose = (a: "bullish" | "bearish") => {
    if (answer !== null) return;
    setAnswer(a);
    const ok = a === truth.direction;
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    AccessibilityInfo.announceForAccessibility(ok ? "Correct" : "Not quite");
    onResult?.(ok);
  };
  const next = () => {
    setAnswer(null);
    setAttempt(attempt + 1);
  };

  return (
    <View testID="candle-quiz" style={{ gap: spacing.md }}>
      <View
        style={{
          backgroundColor: market.navy,
          borderRadius: radii.card,
          padding: spacing.lg,
          gap: spacing.sm,
        }}
      >
        <InteractiveCandlestickChart
          candles={candles}
          height={200}
          slot={14}
          highlight={index}
          testID="quiz-chart"
        />
        <Text variant="caption" style={{ color: market.onNavyMuted }}>
          {SIMULATED_LABEL}
        </Text>
      </View>
      <Text variant="subheading" accessibilityRole="header" testID="quiz-question">
        Is the highlighted candle (number {index + 1}) bullish or bearish?
      </Text>
      <Text variant="caption" tone="muted">
        Look at where it opened and where it closed. Bullish closes higher than it opened.
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Bullish ▲"
            variant="secondary"
            disabled={answer !== null}
            onPress={() => choose("bullish")}
            accessibilityLabel="Answer: bullish"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Bearish ▼"
            variant="secondary"
            disabled={answer !== null}
            onPress={() => choose("bearish")}
            accessibilityLabel="Answer: bearish"
          />
        </View>
      </View>
      {answer !== null ? (
        <View
          testID="quiz-feedback"
          accessibilityLiveRegion="polite"
          style={{
            borderRadius: radii.control,
            padding: spacing.md,
            gap: spacing.xs,
            backgroundColor: correct ? status.successTint : status.warningTint,
            borderWidth: 1,
            borderColor: correct ? status.success : status.warning,
          }}
        >
          <Text variant="bodyStrong" style={{ color: correct ? status.success : status.warning }}>
            {correct ? "✓ Correct" : "✗ Not quite"}: it is {truth.direction}.
          </Text>
          <Text>{truth.text}</Text>
          <Button label="Try another candle" onPress={next} />
        </View>
      ) : null}
      <Text variant="caption" tone="muted" testID="quiz-score" style={{ color: neutrals.muted }}>
        Score this session: {score.right} of {score.total}
      </Text>
    </View>
  );
}
