import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { motion } from "../motion/motion";
import { colors, market, neutrals, radii, spacing } from "../theme";
import { Button, Chip, Text, useReducedMotion } from "../ui";

/**
 * True when the classroom has commissioned photoreal artwork. It does not yet: the room is a
 * provisional vector scene (no 3D models, no avatars), and says so on screen.
 */
export const CLASSROOM_ART_COMPLETE = false;

export type CameraView = "classroom" | "screen" | "desk";
export const CAMERA_VIEWS: { key: CameraView; label: string }[] = [
  { key: "classroom", label: "Classroom" },
  { key: "screen", label: "Focus screen" },
  { key: "desk", label: "Desk" },
];
const ROOM_HEIGHT = 96;

/** Back wall, ceiling light panels and a soft floor line. Provisional scenery only. */
function Room() {
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 24">
      <Defs>
        <LinearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.page} />
          <Stop offset="1" stopColor={market.navy} />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="24" fill="url(#wall)" />
      {[8, 38, 68].map((x) => (
        <Rect
          key={x}
          x={x}
          y="3"
          width="24"
          height="3"
          rx="1.5"
          fill={colors.champagne}
          opacity={0.35}
        />
      ))}
      <Rect x="0" y="22.6" width="100" height="0.5" fill={colors.champagne} opacity={0.5} />
    </Svg>
  );
}

/**
 * The lesson "classroom". The real lesson video (`children`, the existing player with all its
 * controls, resume and progress reporting) stays mounted in a screen frame at all times; the three
 * camera views only change how much of the room and desk is shown around it. Native buttons give
 * every destination, so nothing depends on touching a scene object.
 */
export function ClassroomStage({ courseId, children }: { courseId: string; children: ReactNode }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [view, setView] = useState<CameraView>("classroom");
  const room = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const to = view === "classroom" ? 1 : 0;
    if (reduced !== false) {
      room.setValue(to);
      return;
    }
    Animated.timing(room, {
      toValue: to,
      duration: motion.navigation,
      easing: motion.easeOut,
      useNativeDriver: false,
    }).start();
  }, [view, reduced, room]);
  return (
    <View testID="classroom-stage" style={{ gap: spacing.sm }}>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        accessibilityRole="tablist"
      >
        {CAMERA_VIEWS.map((v) => (
          <Chip
            key={v.key}
            label={v.label}
            selected={view === v.key}
            onPress={() => setView(v.key)}
          />
        ))}
      </View>
      <Animated.View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          height: room.interpolate({ inputRange: [0, 1], outputRange: [0, ROOM_HEIGHT] }),
          opacity: room,
          overflow: "hidden",
          borderRadius: radii.card,
          borderWidth: 1,
          borderColor: market.grid,
        }}
      >
        <Room />
      </Animated.View>
      {/* The screen frame. The player inside is the existing one, unchanged. */}
      <View
        testID="classroom-screen"
        style={{
          padding: spacing.sm,
          gap: spacing.sm,
          borderRadius: radii.card,
          backgroundColor: market.navy,
          borderWidth: 2,
          borderColor: view === "screen" ? colors.blue : market.grid,
        }}
      >
        {children}
      </View>
      {view !== "screen" ? (
        <View
          testID="classroom-desk"
          style={{
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radii.card,
            backgroundColor: neutrals.surface,
            borderWidth: 1,
            borderColor: neutrals.divider,
            borderBottomWidth: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Feather name="layers" size={16} color={colors.link} accessible={false} />
            <Text variant="caption" tone="muted" style={{ letterSpacing: 0.8, fontWeight: "700" }}>
              YOUR DESK
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <Button
              label="Course lessons"
              variant="secondary"
              accessibilityLabel="Open course lessons"
              onPress={() => router.push(`/course/${courseId}`)}
            />
            <Button
              label="Assignments"
              variant="secondary"
              accessibilityLabel="Open assignments"
              onPress={() => router.push("/assignments")}
            />
            <Button
              label="My learning"
              variant="secondary"
              accessibilityLabel="Open my learning"
              onPress={() => router.push("/courses")}
            />
          </View>
        </View>
      ) : null}
      {CLASSROOM_ART_COMPLETE ? null : (
        <Text variant="caption" tone="muted" testID="classroom-art-notice">
          Placeholder classroom scenery. 3D classroom and realistic artwork are still to be
          delivered.
        </Text>
      )}
    </View>
  );
}
