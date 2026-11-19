import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Svg, { G, Line, Rect } from "react-native-svg";
import { colors, market, radii, spacing } from "../theme";
import { Text, useReducedMotion } from "../ui";
import { Pressable } from "react-native";
import { forTimeframe, simulatedSeries, type Candle } from "./chart-data";

export const PREVIEW_CANDLES = 12;
export const REVEAL_STEP_MS = 70;
const CHART_H = 84;

/** The short, fixed sequence shown on Home: the last 12 daily candles of the simulated series. */
export function previewCandles(): Candle[] {
  return forTimeframe(simulatedSeries(7, 24 * PREVIEW_CANDLES), "1D").slice(-PREVIEW_CANDLES);
}

/** "▲ Bullish: opened 101.20, closed 103.40", the same words the Learning Lab uses. */
export function candleLine(c: Candle): string {
  const up = c.close >= c.open;
  return `${up ? "▲ Bullish" : "▼ Bearish"}: opened ${c.open.toFixed(2)}, closed ${c.close.toFixed(2)}`;
}

/**
 * A compact Home card: a navy panel with twelve simulated candles, one line of text and one
 * action. The candles appear one after another once, when the screen first has focus. It stops if
 * the screen loses focus, does not play at all when the system asks for reduced motion, and never
 * loops, so nothing moves like a live market. Tapping a candle names it; the full Learning Lab
 * has the timeframes, zoom, levels and detailed readings.
 */
export function MarketPreviewCard() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const candles = useMemo(previewCandles, []);
  const [shown, setShown] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = shown >= candles.length;

  // Play while focused, and only until every candle is visible. Blur stops the timer.
  useFocusEffect(
    useCallback(() => {
      if (reduced === null) return undefined;
      if (reduced) {
        setShown(candles.length);
        return undefined;
      }
      timer.current = setInterval(() => {
        setShown((n) => {
          if (n + 1 >= candles.length && timer.current) clearInterval(timer.current);
          return Math.min(n + 1, candles.length);
        });
      }, REVEAL_STEP_MS);
      return () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
      };
    }, [reduced, candles.length]),
  );

  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const y = (p: number) => 4 + (1 - (p - lo) / (hi - lo || 1)) * (CHART_H - 8);
  const slot = width > 0 ? width / candles.length : 0;
  const pick = selected === null ? null : candles[selected];

  return (
    <View
      testID="market-preview"
      style={{
        backgroundColor: market.navy,
        borderRadius: radii.card,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <Text
          variant="bodyStrong"
          style={{ color: market.onNavy, flexShrink: 1 }}
          accessibilityRole="header"
        >
          Market Learning Preview
        </Text>
        <View
          accessible
          accessibilityLabel="Simulated data, not a live market"
          testID="simulated-badge"
          style={{
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: market.grid,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          <Text variant="caption" style={{ color: market.onNavyMuted }}>
            Simulated
          </Text>
        </View>
      </View>

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        testID="preview-chart"
        style={{ height: CHART_H }}
        accessibilityLabel={`Twelve simulated candles. Tap one to read it.`}
      >
        {width > 0 ? (
          <Svg width={width} height={CHART_H}>
            <Line
              x1={0}
              x2={width}
              y1={CHART_H / 2}
              y2={CHART_H / 2}
              stroke={market.grid}
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            {candles.map((c, i) => {
              if (i >= shown) return null;
              const up = c.close >= c.open;
              const color = up ? market.up : market.down;
              const cx = i * slot + slot / 2;
              const bw = Math.max(4, slot * 0.5);
              const top = y(Math.max(c.open, c.close));
              const bottom = y(Math.min(c.open, c.close));
              return (
                <G
                  key={i}
                  testID={`preview-candle-${i}`}
                  accessibilityLabel={`Candle ${i + 1}, ${candleLine(c)}`}
                  onPress={() => setSelected(i)}
                >
                  <Rect x={i * slot} y={0} width={slot} height={CHART_H} fill="transparent" />
                  {selected === i ? (
                    <Rect
                      x={i * slot + 1}
                      y={1}
                      width={slot - 2}
                      height={CHART_H - 2}
                      rx={4}
                      fill={market.navyRaised}
                    />
                  ) : null}
                  <Line
                    x1={cx}
                    x2={cx}
                    y1={y(c.high)}
                    y2={y(c.low)}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <Rect
                    x={cx - bw / 2}
                    y={top}
                    width={bw}
                    height={Math.max(2, bottom - top)}
                    fill={color}
                    rx={1}
                  />
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>

      <Text
        variant="caption"
        style={{ color: market.onNavyMuted }}
        testID="preview-readout"
        accessibilityLiveRegion="polite"
      >
        {pick
          ? candleLine(pick)
          : done
            ? "Tap a candle to see how it formed."
            : "Drawing example candles…"}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Explore Learning Lab"
        onPress={() => router.push("/lab")}
        testID="open-lab"
        style={({ pressed }) => ({
          minHeight: 44,
          borderRadius: radii.control,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? market.blueOnNavy : colors.blue,
        })}
      >
        <Text variant="bodyStrong" tone="onBlue">
          Explore Learning Lab
        </Text>
      </Pressable>
    </View>
  );
}
