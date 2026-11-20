import { useId } from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { market, radii, spacing, status } from "../theme";
import { Text } from "../ui";
import type { ReactNode } from "react";

/**
 * Purely decorative: a few invented candles and a line on a fine grid. It carries no prices,
 * percentages or performance, and is hidden from screen readers.
 */
function ChartMark({ width, height }: { width: number; height: number }) {
  const candles = [
    { x: 0.1, top: 0.52, bottom: 0.78, wick: [0.42, 0.86], up: true },
    { x: 0.28, top: 0.4, bottom: 0.62, wick: [0.32, 0.7], up: true },
    { x: 0.46, top: 0.5, bottom: 0.66, wick: [0.4, 0.74], up: false },
    { x: 0.64, top: 0.3, bottom: 0.52, wick: [0.2, 0.6], up: true },
    { x: 0.82, top: 0.16, bottom: 0.4, wick: [0.08, 0.5], up: true },
  ];
  const bw = Math.max(5, width * 0.09);
  return (
    <Svg width={width} height={height}>
      {[0.25, 0.5, 0.75].map((y) => (
        <Line
          key={y}
          x1={0}
          x2={width}
          y1={height * y}
          y2={height * y}
          stroke={market.grid}
          strokeWidth={1}
          strokeDasharray="2 4"
        />
      ))}
      {candles.map((c, i) => {
        const color = c.up ? market.up : market.down;
        return (
          <G key={i}>
            <Line
              x1={width * c.x}
              x2={width * c.x}
              y1={height * c.wick[0]!}
              y2={height * c.wick[1]!}
              stroke={color}
              strokeWidth={1.5}
            />
            <Rect
              x={width * c.x - bw / 2}
              y={height * c.top}
              width={bw}
              height={height * (c.bottom - c.top)}
              rx={1.5}
              fill={color}
            />
          </G>
        );
      })}
      <Path
        d={`M0,${height * 0.82} C${width * 0.25},${height * 0.7} ${width * 0.4},${height * 0.78} ${width * 0.55},${height * 0.5} S${width * 0.85},${height * 0.22} ${width},${height * 0.1}`}
        stroke={market.blueOnNavy}
        strokeWidth={2}
        fill="none"
      />
    </Svg>
  );
}

/**
 * The page header: a navy-to-blue surface with the brand, the title and one line of support. The
 * gradient and the chart mark are decoration behind and beside the text, which sits in normal flow.
 * The mark leaves when the screen is narrow or the system text is large, so text keeps its room.
 * `greeting` adds a short line above the title; `children` is an optional row below (an action).
 */
export function StudioHeader({
  title,
  subtitle,
  greeting,
  children,
  testID = "studio-header",
}: {
  title: string;
  subtitle: string;
  greeting?: string | undefined;
  children?: ReactNode;
  testID?: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const gradientId = useId().replace(/:/g, "");
  const showMark = width >= 340 && fontScale < 1.4;
  const markW = Math.round(Math.min(120, Math.max(84, width * 0.28)));
  return (
    <View
      testID={testID}
      style={{ borderRadius: radii.card, overflow: "hidden", backgroundColor: market.navy }}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={market.navy} />
              <Stop offset="0.55" stopColor={market.navy} />
              <Stop offset="1" stopColor={status.blueLip} stopOpacity={0.9} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      </View>
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
            <Text variant="caption" style={{ color: market.blueOnNavy, letterSpacing: 0.8 }}>
              CHARTNEXA ACADEMY
            </Text>
            {greeting ? (
              <Text
                variant="caption"
                style={{ color: market.onNavyMuted }}
                testID={`${testID}-greeting`}
              >
                {greeting}
              </Text>
            ) : null}
            <Text
              variant="title"
              accessibilityRole="header"
              style={{ color: market.onNavy, fontSize: 26, lineHeight: 32 }}
            >
              {title}
            </Text>
            <Text style={{ color: market.onNavyMuted }}>{subtitle}</Text>
          </View>
          {showMark ? (
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              testID={`${testID}-mark`}
              style={{ width: markW, height: Math.round(markW * 0.8), flexShrink: 0 }}
            >
              <ChartMark width={markW} height={Math.round(markW * 0.8)} />
            </View>
          ) : null}
        </View>
        {children}
      </View>
    </View>
  );
}
