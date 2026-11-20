import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { colors, market } from "../theme";

/** Decorative chart-inspired course artwork, never represented as market data. */
export function WorkshopArt({ compact = false }: { compact?: boolean }) {
  return (
    <Svg width="100%" height={compact ? 100 : 154} viewBox="0 0 340 154" accessible={false}>
      {[28, 66, 104, 142].map((y) => (
        <Line
          key={y}
          x1="0"
          x2="340"
          y1={y}
          y2={y}
          stroke={market.blueOnNavy}
          strokeOpacity={0.24}
        />
      ))}
      {[30, 85, 140, 195, 250, 305].map((x) => (
        <Line
          key={x}
          x1={x}
          x2={x}
          y1="0"
          y2="154"
          stroke={market.blueOnNavy}
          strokeOpacity={0.18}
        />
      ))}
      <Path
        d="M8 130 C50 130 48 82 88 90 S140 124 168 74 S224 100 254 44 S300 64 330 18"
        fill="none"
        stroke={colors.surface}
        strokeWidth="3"
        strokeDasharray="6 7"
        opacity={0.65}
      />
      {[
        { x: 45, y: 99, h: 28 },
        { x: 92, y: 73, h: 25 },
        { x: 139, y: 88, h: 21 },
        { x: 186, y: 50, h: 38 },
        { x: 233, y: 62, h: 24 },
        { x: 280, y: 18, h: 39 },
      ].map((c, i) => (
        <Svg key={c.x}>
          <Line
            x1={c.x + 8}
            x2={c.x + 8}
            y1={c.y - 10}
            y2={c.y + c.h + 12}
            stroke={colors.surface}
            strokeWidth="2"
          />
          <Rect
            x={c.x}
            y={c.y}
            width="16"
            height={c.h}
            rx="4"
            fill={i === 2 || i === 4 ? colors.blue : colors.surface}
            stroke={colors.surface}
            strokeWidth="2"
          />
        </Svg>
      ))}
      <Circle cx="315" cy="21" r="16" fill={colors.surface} />
      <Path d="M308 21 L313 26 L322 16" fill="none" stroke={colors.blue} strokeWidth="3" />
    </Svg>
  );
}
