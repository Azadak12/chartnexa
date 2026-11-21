import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Animated, Image, Pressable, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useLayout } from "../layout/responsive";
import { motion, useAmbientLoop } from "../motion/motion";
import { accents, colors, market, radii, spacing } from "../theme";
import { Text, useReducedMotion } from "../ui";
import {
  CITY_ART_COMPLETE,
  DESTINATIONS,
  HERO_ART,
  SCENE_ASPECT,
  type Destination,
} from "./city-assets";

/** Deterministic lit/unlit pattern, so windows never flicker between renders. */
const lit = (i: number, j: number) => (i * 7 + j * 13) % 5 !== 0;

function Windows({
  x,
  y,
  w,
  h,
  cols,
  rows,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
}) {
  const cw = w / cols;
  const rh = h / rows;
  const out = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      out.push(
        <Rect
          key={`${i}-${j}`}
          x={x + i * cw + cw * 0.2}
          y={y + j * rh + rh * 0.22}
          width={cw * 0.6}
          height={rh * 0.5}
          fill={lit(i, j) ? colors.champagne : market.grid}
          opacity={lit(i, j) ? 0.55 : 0.5}
        />,
      );
  return <>{out}</>;
}

/**
 * PROVISIONAL scenery. Final art is commissioned photoreal imagery (docs/design/market-city-assets.md);
 * this vector skyline only holds the layout, lighting and tap areas until it arrives.
 */
function ProvisionalScene() {
  const far = [
    [0, 52, 9, 30],
    [8, 44, 8, 38],
    [16, 56, 6, 26],
    [58, 48, 7, 34],
    [66, 40, 6, 42],
    [72, 54, 9, 28],
    [86, 46, 7, 36],
    [93, 54, 7, 28],
  ] as const;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 90" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.page} />
          <Stop offset="0.65" stopColor={market.navy} />
          <Stop offset="1" stopColor={colors.blueTint} />
        </LinearGradient>
        <LinearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={market.navyRaised} />
          <Stop offset="1" stopColor={market.navy} />
        </LinearGradient>
        <LinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.surface} />
          <Stop offset="1" stopColor={colors.page} />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="90" fill="url(#sky)" />
      {far.map(([x, y, w, h], i) => (
        <Rect key={i} x={x} y={y} width={w} height={h} fill={market.navyRaised} opacity={0.55} />
      ))}
      {DESTINATIONS.map((d) => {
        const x = d.box.x * 100;
        const y = d.box.y * 90;
        const w = d.box.w * 100;
        const h = d.box.h * 90;
        return (
          <G key={d.key}>
            <Rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="url(#tower)"
              stroke={market.grid}
              strokeWidth={0.3}
            />
            {d.key === "lab" ? (
              <Path
                d={`M ${x} ${y} A ${w / 2} ${w / 2} 0 0 1 ${x + w} ${y} Z`}
                fill={market.navyRaised}
                stroke={colors.blue}
                strokeWidth={0.3}
              />
            ) : null}
            <Windows
              x={x + 1}
              y={y + 2}
              w={w - 2}
              h={h - 10}
              cols={Math.max(3, Math.round(w / 4))}
              rows={Math.max(3, Math.round(h / 6))}
            />
          </G>
        );
      })}
      <Rect x="0" y="80" width="100" height="10" fill="url(#ground)" />
      <Rect x="0" y="80" width="100" height="0.4" fill={colors.champagne} opacity={0.6} />
    </Svg>
  );
}

function Hotspot({
  d,
  w,
  h,
  onOpen,
}: {
  d: Destination;
  w: number;
  h: number;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(0)).current;
  const to = (v: number) =>
    Animated.timing(press, { toValue: v, duration: motion.fast, useNativeDriver: true }).start();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={d.spoken}
      onPress={onOpen}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      testID={`city-${d.key}`}
      style={{
        position: "absolute",
        left: d.box.x * w,
        top: d.box.y * h,
        width: d.box.w * w,
        height: d.box.h * h,
      }}
    >
      {/* Depth response: the building settles slightly and its lights warm up while pressed. */}
      <Animated.View
        style={{
          flex: 1,
          borderRadius: radii.control / 3,
          borderWidth: 1.5,
          borderColor: colors.champagne,
          backgroundColor: colors.champagneTint,
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: spacing.xs,
          opacity: press.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.85] }),
          transform: [
            {
              scale:
                reduced === false
                  ? press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] })
                  : 1,
            },
          ],
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: spacing.xs,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
        pointerEvents="none"
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: colors.page,
            borderRadius: radii.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: colors.blue,
          }}
        >
          <Feather name={d.icon} size={12} color={colors.link} accessible={false} />
          <Text variant="caption" accessible={false} numberOfLines={1} style={{ flexShrink: 1 }}>
            {d.label}
          </Text>
          <Feather name="chevron-right" size={12} color={colors.champagne} accessible={false} />
        </View>
      </View>
    </Pressable>
  );
}

const TILE_ACCENT = { learn: "blue", explore: "amber", lab: "emerald", tasks: "sky" } as const;

/** One destination as a control under the hero: its picture, then its name and an arrow. */
function DestinationTile({ d, onOpen }: { d: Destination; onOpen: () => void }) {
  const a = accents[TILE_ACCENT[d.key as keyof typeof TILE_ACCENT] ?? "blue"];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={d.spoken}
      onPress={onOpen}
      testID={`city-${d.key}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        borderRadius: radii.card,
        borderWidth: 1.5,
        borderColor: a.ink,
        backgroundColor: pressed ? colors.surface : a.tint,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Image
        source={d.art}
        accessible={false}
        resizeMode="cover"
        style={{ width: "100%", aspectRatio: 1.6 }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          minHeight: 44,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.sm,
          backgroundColor: a.tint,
        }}
      >
        <Text variant="bodyStrong" accessible={false} style={{ flexShrink: 1 }}>
          {d.label}
        </Text>
        <Feather name="chevron-right" size={16} color={a.ink} accessible={false} />
      </View>
    </Pressable>
  );
}

/** The photographic entrance: the academy lounge, then the four places to go. */
function HeroEntrance({ onOpen }: { onOpen: (d: Destination) => void }) {
  const layout = useLayout();
  const [w, setW] = useState(320);
  // Slow camera drift and a warm light that breathes; both rest with Reduced Motion.
  const drift = useAmbientLoop();
  const glow = useAmbientLoop(motion.ambient / 2, 0.5);
  // Phones: two columns, so names have room at any text size. Tablets and wide screens: four.
  const perRow = layout.isTablet ? 4 : 2;
  // The picture is cropped to this shape, never stretched: a taller frame on phones keeps the
  // architecture prominent, a wider one on tablets.
  const heroAspect = layout.isTablet ? 2.5 : 1.9;
  const rows: Destination[][] = [];
  for (let i = 0; i < DESTINATIONS.length; i += perRow)
    rows.push(DESTINATIONS.slice(i, i + perRow));
  const overscan = w * 0.06;
  return (
    <View style={{ gap: spacing.md }}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width || w)}
        style={{
          borderRadius: radii.card,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: market.grid,
          aspectRatio: heroAspect,
        }}
      >
        <Animated.Image
          source={HERO_ART}
          accessibilityRole="image"
          accessibilityLabel="The ChartNexa Academy lounge"
          resizeMode="cover"
          testID="city-hero-art"
          style={{
            position: "absolute",
            left: -overscan,
            top: 0,
            width: w + overscan * 2,
            height: "100%",
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-overscan * 0.8, overscan * 0.8],
                }),
              },
            ],
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: colors.champagne,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.09] }),
          }}
        />
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.sm }}>
          {r.map((d) => (
            <DestinationTile key={d.key} d={d} onOpen={() => onOpen(d)} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * The Student Home entrance. Every tap area goes to a screen that already exists, and the tab bar
 * remains the reliable way around: this is presentation, never the only route.
 */
export function MarketCity() {
  const router = useRouter();
  const layout = useLayout();
  const [width, setWidth] = useState(
    Math.min(layout.width, layout.contentMaxWidth) - layout.gutter * 2,
  );
  const height = width / SCENE_ASPECT;
  const drift = useAmbientLoop();
  const glow = useAmbientLoop(motion.ambient / 2, 0.5);
  if (HERO_ART)
    return (
      <View testID="market-city" style={{ gap: spacing.sm }}>
        <HeroEntrance onOpen={(d) => router.push(d.route)} />
        <Text variant="caption" tone="muted" testID="city-art-notice">
          Illustration only. The screens in the picture do not show real market prices.
        </Text>
      </View>
    );
  return (
    <View testID="market-city" style={{ gap: spacing.sm }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width || width)}
        style={{
          width: "100%",
          height,
          borderRadius: radii.card,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: market.grid,
        }}
      >
        <ProvisionalScene />
        {/* Slow horizon light and drifting haze: the only ambient motion. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: height * 0.2,
            height: height * 0.3,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.2] }),
          }}
        >
          <Svg width="100%" height="100%">
            <Ellipse cx="50%" cy="60%" rx="50%" ry="40%" fill={colors.champagne} />
          </Svg>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: height * 0.12,
            left: 0,
            width: width * 1.4,
            opacity: 0.5,
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-width * 0.3, 0],
                }),
              },
            ],
          }}
        >
          <Svg width="100%" height={height * 0.18}>
            <Ellipse cx="30%" cy="50%" rx="14%" ry="30%" fill={market.blueOnNavy} opacity={0.1} />
            <Ellipse cx="72%" cy="40%" rx="12%" ry="26%" fill={market.blueOnNavy} opacity={0.08} />
          </Svg>
        </Animated.View>
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: spacing.md, right: spacing.md }}
        >
          <Svg width={14} height={14}>
            <Circle cx={7} cy={7} r={4} fill={colors.champagne} opacity={0.8} />
          </Svg>
        </View>
        {DESTINATIONS.map((d) => (
          <Hotspot key={d.key} d={d} w={width} h={height} onOpen={() => router.push(d.route)} />
        ))}
      </View>
      {CITY_ART_COMPLETE ? null : (
        <Text variant="caption" tone="muted" testID="city-art-notice">
          Placeholder scenery. Final photoreal artwork is still to be delivered.
        </Text>
      )}
    </View>
  );
}
