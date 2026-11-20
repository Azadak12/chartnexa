import { Feather } from "@expo/vector-icons";
import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import { colors, MIN_TOUCH_SIZE, neutrals } from "../theme";
import { Text, useReducedMotion } from "../ui";

type BarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
type Icon = ComponentProps<typeof Feather>["name"];

export const TAB_ICON_SIZE = 22;
export const TAB_LABEL_SIZE = 11;
/** Large system fonts grow the label at most this much, so it never outgrows its column. */
export const TAB_LABEL_MAX_SCALE = 1.2;
export const TAB_BAR_MIN_HEIGHT = 56;

/** What the layout sets on a tab: its short label and icon, and whether it has a button. */
export interface TabMeta {
  label: string;
  icon: Icon;
  hidden: boolean;
}

/** The icon hops up and settles when its tab becomes selected (static with reduced motion). */
function TabIcon({ name, focused, color }: { name: Icon; focused: boolean; color: string }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (reduced !== false) {
      t.setValue(focused ? 1 : 0);
      return;
    }
    Animated.spring(t, {
      toValue: focused ? 1 : 0,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [focused, reduced, t]);
  return (
    <Animated.View
      accessible={false}
      style={{
        transform: [
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
        ],
      }}
    >
      <Feather name={name} size={TAB_ICON_SIZE} color={color} accessible={false} />
    </Animated.View>
  );
}

/**
 * A bottom bar made of equal-width, flexible items. Each item centers its icon and one-line label,
 * is at least 56px tall (above the 44px touch minimum), shows the selected tab with a blue bar and
 * blue text, and sits above the Android gesture or button bar through the safe-area inset.
 * Tabs a role does not use keep their route but have no item.
 */
export function ResponsiveTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
  meta,
}: BarProps & { meta: Record<string, TabMeta> }) {
  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: neutrals.divider,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {state.routes.map((route, index) => {
        // Folders with only an index file are named "explore/index" in the navigator state.
        const key = route.name.replace(/\/index$/, "");
        const m = meta[key];
        if (!m || m.hidden) return null;
        const focused = state.index === index;
        const options = descriptors[route.key]?.options;
        const name = options?.tabBarAccessibilityLabel ?? m.label;
        const color = focused ? colors.link : neutrals.muted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={name}
            accessibilityState={{ selected: focused }}
            testID={`tab-item-${key}`}
            onPress={() => {
              const event = emitter.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: Math.max(TAB_BAR_MIN_HEIGHT, MIN_TOUCH_SIZE),
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 2,
              paddingTop: 4,
              gap: 3,
            }}
          >
            <View
              accessible={false}
              style={{
                position: "absolute",
                top: 0,
                height: 3,
                width: "56%",
                borderRadius: 2,
                backgroundColor: focused ? colors.blue : "transparent",
              }}
            />
            <TabIcon name={m.icon} focused={focused} color={color} />
            <Text
              accessible={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
              style={{
                fontSize: TAB_LABEL_SIZE,
                lineHeight: 14,
                textAlign: "center",
                color,
                fontWeight: focused ? "700" : "500",
                alignSelf: "stretch",
              }}
            >
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
