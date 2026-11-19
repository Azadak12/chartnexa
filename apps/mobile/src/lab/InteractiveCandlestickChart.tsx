import { memo, useMemo } from "react";
import { ScrollView, View } from "react-native";
import Svg, { G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { market } from "../theme";
import { directionOf, exampleLevels, sma, type Candle } from "./chart-data";

export interface ChartProps {
  candles: readonly Candle[];
  height?: number;
  /** Width in points of one candle slot; zoom changes this. */
  slot?: number;
  selected?: number | null;
  onSelect?: (index: number) => void;
  /** An outlined candle, used by exercises. */
  highlight?: number | null;
  showAverages?: boolean;
  showLevels?: boolean;
  testID?: string;
}

const AXIS_W = 46;
const PAD_T = 10;
const PAD_B = 22;

/**
 * A candlestick chart drawn with SVG. Tap a candle to inspect it; scroll sideways for more; the
 * parent changes `slot` to zoom. Bullish candles are blue-green and bearish red, and the colour is
 * never the only cue: the parent shows the direction in words and with an arrow.
 */
function ChartImpl({
  candles,
  height = 240,
  slot = 14,
  selected = null,
  onSelect,
  highlight = null,
  showAverages = false,
  showLevels = false,
  testID = "chart",
}: ChartProps) {
  const geometry = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const pad = (hi - lo) * 0.08 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }, [candles]);
  const plotH = height - PAD_T - PAD_B;
  const y = (p: number) => PAD_T + (1 - (p - geometry.lo) / (geometry.hi - geometry.lo)) * plotH;
  const width = Math.max(candles.length * slot, 1);
  const bodyW = Math.max(3, slot * 0.62);
  const x = (i: number) => i * slot + slot / 2;

  const averages = useMemo(
    () =>
      showAverages
        ? [
            { values: sma(candles, 5), color: market.blueOnNavy },
            { values: sma(candles, 12), color: market.onNavy },
          ]
        : [],
    [candles, showAverages],
  );
  const levels = useMemo(() => (showLevels ? exampleLevels(candles) : null), [candles, showLevels]);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => geometry.lo + (geometry.hi - geometry.lo) * f);
  const labelEvery = Math.max(1, Math.round(56 / slot));

  return (
    <View style={{ flexDirection: "row", height }} testID={testID}>
      {/* Price axis stays put while the candles scroll. */}
      <Svg width={AXIS_W} height={height} accessible={false}>
        {ticks.map((p) => (
          <SvgText
            key={p}
            x={AXIS_W - 6}
            y={y(p) + 4}
            fontSize={10}
            fill={market.onNavyMuted}
            textAnchor="end"
          >
            {p.toFixed(1)}
          </SvgText>
        ))}
      </Svg>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: Math.max(0, width - 280), y: 0 }}
        accessibilityLabel="Chart candles, scroll sideways for earlier prices"
      >
        <Svg width={width} height={height}>
          {ticks.map((p) => (
            <Line
              key={p}
              x1={0}
              x2={width}
              y1={y(p)}
              y2={y(p)}
              stroke={market.grid}
              strokeWidth={1}
              opacity={0.6}
            />
          ))}
          {candles.map((c, i) =>
            i % labelEvery === 0 ? (
              <SvgText
                key={`t${i}`}
                x={x(i)}
                y={height - 6}
                fontSize={10}
                fill={market.onNavyMuted}
                textAnchor="middle"
              >
                {`#${i + 1}`}
              </SvgText>
            ) : null,
          )}
          {levels?.support != null ? (
            <G>
              <Line
                x1={0}
                x2={width}
                y1={y(levels.support)}
                y2={y(levels.support)}
                stroke={market.upText}
                strokeDasharray="6 4"
                strokeWidth={1.5}
              />
              <SvgText x={6} y={y(levels.support) - 4} fontSize={10} fill={market.upText}>
                Example support
              </SvgText>
            </G>
          ) : null}
          {levels?.resistance != null ? (
            <G>
              <Line
                x1={0}
                x2={width}
                y1={y(levels.resistance)}
                y2={y(levels.resistance)}
                stroke={market.downText}
                strokeDasharray="6 4"
                strokeWidth={1.5}
              />
              <SvgText x={6} y={y(levels.resistance) + 12} fontSize={10} fill={market.downText}>
                Example resistance
              </SvgText>
            </G>
          ) : null}
          {candles.map((c, i) => {
            const dir = directionOf(c);
            const color =
              dir === "bearish" ? market.down : dir === "bullish" ? market.up : market.onNavyMuted;
            const top = y(Math.max(c.open, c.close));
            const bodyH = Math.max(2, Math.abs(y(c.open) - y(c.close)));
            const isSel = selected === i;
            const isHi = highlight === i;
            return (
              <G
                key={c.t}
                onPress={onSelect ? () => onSelect(i) : undefined}
                testID={`candle-${i}`}
              >
                {/* A wider invisible target makes thin candles easy to tap. */}
                <Rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
                {isSel || isHi ? (
                  <Rect
                    x={i * slot + 1}
                    y={PAD_T}
                    width={slot - 2}
                    height={plotH}
                    fill={market.blueOnNavy}
                    opacity={isHi ? 0.22 : 0.16}
                  />
                ) : null}
                <Line
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(c.high)}
                  y2={y(c.low)}
                  stroke={color}
                  strokeWidth={1.5}
                />
                <Rect
                  x={x(i) - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={bodyH}
                  rx={1.5}
                  fill={color}
                  stroke={isHi ? market.onNavy : undefined}
                  strokeWidth={isHi ? 2 : 0}
                />
              </G>
            );
          })}
          {averages.map((m, k) => {
            const pts = m.values
              .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
              .filter((p): p is string => p !== null);
            return pts.length > 1 ? (
              <Polyline
                key={k}
                points={pts.join(" ")}
                fill="none"
                stroke={m.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null;
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}

export const InteractiveCandlestickChart = memo(ChartImpl);
