import { useMemo, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { G, Line, Path, Rect } from "react-native-svg";
import { forTimeframe, simulatedSeries } from "../lab/chart-data";
import { colors, market, radii, spacing } from "../theme";
import { Screen, Text } from "../ui";

const HERO_CANDLES = 14;

/** A small decorative chart on simulated data. No percentage or price is shown: it is not a market. */
function HeroChart({ width, height }: { width: number; height: number }) {
  const candles = useMemo(
    () => forTimeframe(simulatedSeries(11, 24 * HERO_CANDLES), "1D").slice(-HERO_CANDLES),
    [],
  );
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const y = (p: number) => 6 + (1 - (p - lo) / (hi - lo || 1)) * (height - 12);
  const slot = width / candles.length;
  const line = candles
    .map((c, i) => `${i === 0 ? "M" : "L"}${i * slot + slot / 2},${y((c.open + c.close) / 2)}`)
    .join(" ");
  return (
    <Svg width={width} height={height}>
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? market.up : market.down;
        const cx = i * slot + slot / 2;
        const top = y(Math.max(c.open, c.close));
        const bottom = y(Math.min(c.open, c.close));
        return (
          <G key={i}>
            <Line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1.2} />
            <Rect
              x={cx - slot * 0.28}
              y={top}
              width={slot * 0.56}
              height={Math.max(2, bottom - top)}
              fill={color}
            />
          </G>
        );
      })}
      <Path d={line} stroke={market.blueOnNavy} strokeWidth={2} fill="none" />
    </Svg>
  );
}

/**
 * The shared top of the sign-in and sign-up screens: brand, a large title with a short line under
 * it, and a tilted navy chart card on the right that shrinks on narrow phones. The card is
 * decoration and hidden from screen readers.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const heroW = Math.round(Math.min(190, Math.max(120, width * 0.42)));
  return (
    <Screen keyboard>
      <Text variant="heading" accessibilityRole="header" testID="auth-brand">
        ChartNexa{" "}
        <Text variant="heading" tone="link">
          Academy
        </Text>
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
          <Text
            variant="title"
            accessibilityRole="header"
            testID="auth-title"
            style={{ fontSize: 32, lineHeight: 38 }}
          >
            {title}
          </Text>
          <Text tone="muted">{subtitle}</Text>
        </View>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          testID="auth-hero"
          style={{
            width: heroW,
            height: Math.round(heroW * 0.78),
            borderRadius: radii.card,
            backgroundColor: market.navy,
            padding: spacing.sm,
            transform: [{ rotate: "-5deg" }],
            shadowColor: colors.blue,
            shadowOpacity: 0.25,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: market.grid,
              paddingHorizontal: 8,
              paddingVertical: 1,
              marginBottom: 2,
            }}
          >
            <Text variant="caption" style={{ color: market.onNavyMuted, fontSize: 10 }}>
              Simulated
            </Text>
          </View>
          <HeroChart width={heroW - spacing.sm * 2} height={Math.round(heroW * 0.78) - 38} />
        </View>
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
      {footer}
    </Screen>
  );
}
