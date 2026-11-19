import { Children, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { spacing } from "../theme";

/** Fewer columns when the screen is narrow or the system text is large, so nothing is squeezed. */
export function columnsFor(width: number, fontScale: number): 1 | 2 {
  return width < 340 || fontScale >= 1.6 ? 1 : 2;
}

/**
 * A grid built from explicit rows. Each row is a plain flex row whose cells share the width
 * equally (`flex: 1`, `minWidth: 0`) and take the height of the tallest cell. It does not use
 * `flexWrap`: a wrapping row of flex children can report a height of one line while its children
 * wrap onto more, which makes the content below it overlap.
 */
export function Grid({ children, gap = spacing.md }: { children: ReactNode; gap?: number }) {
  const { width, fontScale } = useWindowDimensions();
  const cols = columnsFor(width, fontScale);
  const cells = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  return (
    <View style={{ gap }} testID="grid">
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", gap }} testID={`grid-row-${r}`}>
          {row.map((cell, c) => (
            <View key={c} style={{ flex: 1, minWidth: 0 }}>
              {cell}
            </View>
          ))}
          {/* A last row with one cell keeps the cell half width, like the rows above. */}
          {row.length < cols
            ? Array.from({ length: cols - row.length }, (_, k) => (
                <View key={`pad-${k}`} style={{ flex: 1, minWidth: 0 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}
