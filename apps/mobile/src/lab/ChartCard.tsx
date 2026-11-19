import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { market, radii, spacing } from "../theme";
import { Text } from "../ui";
import {
  describeCandle,
  forTimeframe,
  simulatedSeries,
  SIMULATED_LABEL,
  TIMEFRAMES,
  TIMEFRAME_NAME,
  type Candle,
  type Timeframe,
} from "./chart-data";
import { InteractiveCandlestickChart } from "./InteractiveCandlestickChart";

const SLOTS = [8, 11, 14, 20, 28] as const;
const ARROW = { bullish: "▲", bearish: "▼", doji: "■" } as const;

/** A tappable control on the navy surface; at least 44 points tall. */
function Tap({
  label,
  selected = false,
  disabled = false,
  onPress,
  children,
  testID,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={4}
      style={{
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: spacing.md,
        borderRadius: radii.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? market.blueOnNavy : market.navyRaised,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </Pressable>
  );
}

/**
 * The reusable "market learning" panel: a navy chart with timeframe buttons, zoom, optional
 * averages and example levels, and a plain-language reading of the selected candle. Data is
 * simulated and the panel always says so.
 */
export function ChartCard({
  title = "Market learning preview",
  seed = 7,
  initialTimeframe = "4H",
  compact = false,
}: {
  title?: string;
  seed?: number;
  initialTimeframe?: Timeframe;
  /** Hides the extra toggles (for the Home dashboard). */
  compact?: boolean;
}) {
  const base = useMemo(() => simulatedSeries(seed), [seed]);
  const [tf, setTf] = useState<Timeframe>(initialTimeframe);
  const candles = useMemo(() => forTimeframe(base, tf), [base, tf]);
  const [slotIndex, setSlotIndex] = useState(2);
  const [selected, setSelected] = useState<number | null>(candles.length - 1);
  const [averages, setAverages] = useState(false);
  const [levels, setLevels] = useState(false);

  const chosen =
    (selected !== null ? (candles[selected] as Candle | undefined) : undefined) ?? undefined;
  const reading = chosen ? describeCandle(chosen) : null;

  const changeTf = (next: Timeframe) => {
    setTf(next);
    setSelected(null);
    AccessibilityInfo.announceForAccessibility(`Showing ${TIMEFRAME_NAME[next]} candles`);
  };
  const step = (d: number) => {
    const from = selected ?? candles.length;
    setSelected(Math.min(candles.length - 1, Math.max(0, from + d)));
  };

  return (
    <View
      testID="chart-card"
      style={{
        backgroundColor: market.navy,
        borderRadius: radii.card,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <Text
          variant="subheading"
          accessibilityRole="header"
          style={{ color: market.onNavy, flexShrink: 1 }}
        >
          {title}
        </Text>
        <View
          style={{
            backgroundColor: market.navyRaised,
            borderRadius: radii.pill,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text variant="caption" style={{ color: market.onNavyMuted }} testID="chart-badge">
            Simulated
          </Text>
        </View>
      </View>

      <View
        style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}
        accessibilityRole="radiogroup"
      >
        {TIMEFRAMES.map((t) => (
          <Tap
            key={t}
            label={`${TIMEFRAME_NAME[t]} candles`}
            selected={t === tf}
            onPress={() => changeTf(t)}
            testID={`tf-${t}`}
          >
            <Text variant="bodyStrong" style={{ color: t === tf ? market.navy : market.onNavy }}>
              {t}
            </Text>
          </Tap>
        ))}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginLeft: "auto" }}>
          <Tap
            label="Zoom out"
            disabled={slotIndex === 0}
            onPress={() => setSlotIndex(slotIndex - 1)}
            testID="zoom-out"
          >
            <Feather name="minus" size={18} color={market.onNavy} />
          </Tap>
          <Tap
            label="Zoom in"
            disabled={slotIndex === SLOTS.length - 1}
            onPress={() => setSlotIndex(slotIndex + 1)}
            testID="zoom-in"
          >
            <Feather name="plus" size={18} color={market.onNavy} />
          </Tap>
        </View>
      </View>

      <InteractiveCandlestickChart
        candles={candles}
        slot={SLOTS[slotIndex] as number}
        selected={selected}
        onSelect={setSelected}
        showAverages={averages}
        showLevels={levels}
        testID="chart-main"
      />

      {!compact ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <Tap
            label="Moving averages"
            selected={averages}
            onPress={() => setAverages(!averages)}
            testID="toggle-averages"
          >
            <Text variant="caption" style={{ color: averages ? market.navy : market.onNavy }}>
              Averages (5, 12)
            </Text>
          </Tap>
          <Tap
            label="Example support and resistance"
            selected={levels}
            onPress={() => setLevels(!levels)}
            testID="toggle-levels"
          >
            <Text variant="caption" style={{ color: levels ? market.navy : market.onNavy }}>
              Example levels
            </Text>
          </Tap>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: market.navyRaised,
          borderRadius: radii.control,
          padding: spacing.md,
          gap: spacing.xs,
        }}
        accessibilityLiveRegion="polite"
      >
        {chosen && reading ? (
          <>
            <Text variant="bodyStrong" style={{ color: market.onNavy }} testID="ohlc-title">
              Candle {(selected ?? 0) + 1} of {candles.length} ·{" "}
              <Text
                variant="bodyStrong"
                style={{
                  color:
                    reading.direction === "bearish"
                      ? market.downText
                      : reading.direction === "bullish"
                        ? market.upText
                        : market.onNavyMuted,
                }}
              >
                {ARROW[reading.direction]} {reading.direction}
              </Text>
            </Text>
            <Text variant="caption" style={{ color: market.onNavy }} testID="ohlc-values">
              O {chosen.open.toFixed(2)} H {chosen.high.toFixed(2)} L {chosen.low.toFixed(2)} C{" "}
              {chosen.close.toFixed(2)}
            </Text>
            <Text variant="caption" style={{ color: market.onNavyMuted }} testID="ohlc-text">
              {reading.text}
            </Text>
          </>
        ) : (
          <Text variant="caption" style={{ color: market.onNavyMuted }}>
            Tap a candle to see its open, high, low and close.
          </Text>
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Tap label="Previous candle" onPress={() => step(-1)} testID="prev-candle">
            <Feather name="chevron-left" size={18} color={market.onNavy} />
          </Tap>
          <Tap label="Next candle" onPress={() => step(1)} testID="next-candle">
            <Feather name="chevron-right" size={18} color={market.onNavy} />
          </Tap>
        </View>
      </View>
      <Text variant="caption" style={{ color: market.onNavyMuted }} testID="chart-disclaimer">
        {SIMULATED_LABEL}
      </Text>
    </View>
  );
}
