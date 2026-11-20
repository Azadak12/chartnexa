import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { lessonApi } from "../lessons/lesson-api";
import { ProgressRing } from "../kit/ProgressRing";
import { isAppError, messageFor } from "../api/errors";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, spacing, status } from "../theme";
import { Text, useReducedMotion } from "../ui";
import { progressApi } from "./progress-api";

/** Row height and sideways swing of the winding path. */
export const PATH_ROW = 128;
export const PATH_SWING = 74;
const NODE = 68;

/** Horizontal offset of node `i`: a gentle S-curve like a trail, not a list. */
export const pathOffset = (i: number) => Math.round(Math.sin(i * 1.05) * PATH_SWING);

type NodeState = "done" | "next" | "open";

/** Pulses a halo around the lesson to do next. Static with reduced motion. */
function Halo({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduced !== false) return;
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduced, t]);
  if (!active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: NODE + 20,
        height: NODE + 20,
        borderRadius: radii.pill,
        borderWidth: 3,
        borderColor: colors.blue,
        opacity:
          reduced === false ? t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }) : 0.35,
        transform: [
          {
            scale:
              reduced === false
                ? t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.35] })
                : 1,
          },
        ],
      }}
    />
  );
}

/** The "START" / "CONTINUE" bubble that floats above the next lesson. */
function Bubble({ label }: { label: string }) {
  const reduced = useReducedMotion();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced !== false) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -5, duration: 700, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, y]);
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        top: -34,
        alignSelf: "center",
        transform: [{ translateY: y }],
        backgroundColor: colors.surface,
        borderColor: colors.blue,
        borderWidth: 2,
        borderRadius: radii.control,
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
      }}
    >
      <Text variant="caption" tone="link" style={{ fontWeight: "800" }}>
        {label}
      </Text>
    </Animated.View>
  );
}

function PathNode({
  state,
  position,
  title,
  label,
  onPress,
}: {
  state: NodeState;
  position: number;
  title: string;
  label: string;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(0)).current;
  const to = (v: number) => {
    if (reduced !== false) return;
    Animated.timing(press, { toValue: v, duration: 80, useNativeDriver: true }).start();
  };
  const filled = state !== "open";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${label}`}
      onPress={onPress}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      hitSlop={8}
      style={{ alignItems: "center", width: 140 }}
    >
      {state === "next" ? <Bubble label={position === 1 ? "START" : "CONTINUE"} /> : null}
      <View
        style={{
          width: NODE + 24,
          height: NODE + 24,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Halo active={state === "next"} />
        <Animated.View
          style={{
            width: NODE,
            height: NODE,
            borderRadius: radii.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: filled ? colors.blue : colors.surface,
            borderWidth: filled ? 0 : 3,
            borderColor: neutrals.border,
            // The 3D "pressable" lip every tap target on the path has.
            borderBottomWidth: 6,
            borderBottomColor: filled ? status.blueLip : neutrals.border,
            transform: [
              { translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) },
            ],
          }}
        >
          {state === "done" ? (
            <Feather name="check" size={30} color={colors.onBlue} accessible={false} />
          ) : state === "next" ? (
            <Feather name="play" size={28} color={colors.onBlue} accessible={false} />
          ) : (
            <Text variant="heading" style={{ color: neutrals.muted }} accessible={false}>
              {position}
            </Text>
          )}
        </Animated.View>
      </View>
      <Text
        variant="caption"
        numberOfLines={2}
        style={{ textAlign: "center", color: state === "open" ? neutrals.muted : colors.ink }}
        accessible={false}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** Loaded only on expansion. Every node remains available; this is a guide, not a lock. */
export function LearningJourney({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [width, setWidth] = useState(320);
  const outline = useQuery({
    queryKey: ["lessons", courseId, true],
    queryFn: () => lessonApi.outline(courseId),
    retry: shouldRetry,
  });
  const progress = useQuery({
    queryKey: ["progress", courseId],
    queryFn: () => progressApi.read(courseId),
    retry: shouldRetry,
  });
  const error = outline.error ?? progress.error;
  if (error)
    return (
      <StateView
        state={isAppError(error) && error.kind === "network" ? "offline" : "error"}
        message={isAppError(error) ? error.message : messageFor("unknown")}
        requestId={isAppError(error) ? error.requestId : null}
        onAction={() => {
          void outline.refetch();
          void progress.refetch();
        }}
      />
    );
  if (!outline.data || !progress.data) return <StateView state="loading" />;
  const done = new Set(progress.data.lessons.map((l) => l.lessonId));
  const items = outline.data.items;
  if (!items.length) return <Text tone="muted">Lessons are coming.</Text>;
  const groups: { id: string; title: string; items: typeof items }[] = [];
  for (const lesson of items) {
    const module = outline.data.modules?.find((m) => m.id === lesson.moduleId);
    const id = module?.id ?? "ungrouped";
    const previous = groups[groups.length - 1];
    if (previous?.id === id) previous.items.push(lesson);
    else
      groups.push({
        id,
        title: module ? `Module ${module.position}: ${module.title}` : "Course lessons",
        items: [lesson],
      });
  }
  const nextId = progress.data.nextLessonId;
  let index = 0;
  return (
    <View
      style={{ gap: spacing.lg }}
      testID="learning-journey"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width || 320)}
    >
      {groups.map((g, gi) => {
        const finished = g.items.filter((l) => done.has(l.id)).length;
        const start = index;
        const height = g.items.length * PATH_ROW;
        const cx = width / 2;
        const points = g.items.map((_, i) => ({
          x: cx + pathOffset(start + i),
          y: i * PATH_ROW + PATH_ROW / 2 - 6,
        }));
        const curve = (pts: { x: number; y: number }[]) =>
          pts
            .map((p, i) => {
              if (i === 0) return `M ${p.x} ${p.y}`;
              const q = pts[i - 1]!;
              const m = (q.y + p.y) / 2;
              return `C ${q.x} ${m} ${p.x} ${m} ${p.x} ${p.y}`;
            })
            .join(" ");
        // The trail is blue up to the first lesson that is not finished.
        const firstOpen = g.items.findIndex((l) => !done.has(l.id));
        const lit = firstOpen === -1 ? g.items.length : firstOpen + 1;
        const block = (
          <View key={`${g.id}-${gi}`} accessibilityLabel={g.title} style={{ gap: spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radii.card,
                backgroundColor: colors.blue,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" tone="onBlue" style={{ opacity: 0.85 }}>
                  {g.id === "ungrouped" ? "COURSE" : `MODULE ${gi + 1}`}
                </Text>
                <Text variant="bodyStrong" tone="onBlue">
                  {g.title}
                </Text>
                <Text variant="caption" tone="onBlue">
                  {finished} of {g.items.length} completed
                </Text>
              </View>
              <View
                style={{ backgroundColor: colors.surface, borderRadius: radii.pill, padding: 3 }}
              >
                <ProgressRing
                  completed={finished}
                  total={g.items.length}
                  size={52}
                  stroke={5}
                  testID={`module-ring-${gi}`}
                />
              </View>
            </View>
            <View style={{ height }}>
              <Svg
                width={width}
                height={height}
                style={{ position: "absolute" }}
                pointerEvents="none"
              >
                <Path
                  d={curve(points)}
                  stroke={neutrals.divider}
                  strokeWidth={10}
                  strokeLinecap="round"
                  fill="none"
                />
                {lit > 1 ? (
                  <Path
                    d={curve(points.slice(0, lit))}
                    stroke={colors.blue}
                    strokeOpacity={0.45}
                    strokeWidth={10}
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null}
              </Svg>
              {g.items.map((l, i) => {
                const completed = done.has(l.id);
                const next = l.id === nextId;
                const label = completed ? "Completed" : next ? "Up next" : "Ready when you are";
                return (
                  <View
                    key={l.id}
                    style={{
                      position: "absolute",
                      top: i * PATH_ROW,
                      left: points[i]!.x - 70,
                      width: 140,
                      alignItems: "center",
                    }}
                  >
                    <PathNode
                      state={completed ? "done" : next ? "next" : "open"}
                      position={l.position}
                      title={l.title}
                      label={label}
                      onPress={() => router.push(`/course/${courseId}/lesson/${l.id}`)}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        );
        index += g.items.length;
        return block;
      })}
    </View>
  );
}
