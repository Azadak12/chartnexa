import { Feather } from "@expo/vector-icons";
import { Animated, View } from "react-native";
import type { LiveSession } from "@chartnexa/api-contracts";
import { useAmbientLoop } from "../motion/motion";
import { colors, raised, spacing, status } from "../theme";
import { Button, Text } from "../ui";
import { durationText, STATE_TEXT, whenText } from "./live-api";

/** Month and day of an instant, shown as a calendar block. */
function dateBlock(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  return {
    month: d.toLocaleString(undefined, { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}

/** A soft pulse beside "Live now". It rests with Reduced Motion and while the app is backgrounded. */
function LiveDot() {
  const t = useAmbientLoop(900, 1);
  return (
    <Animated.View
      accessible={false}
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: status.success,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
      }}
    />
  );
}

/** One class: when, how long, its state in words, and Join while it is open. */
export function LiveSessionRow({
  session: s,
  showCourse = false,
  joining,
  onJoin,
}: {
  session: LiveSession;
  showCourse?: boolean;
  joining: boolean;
  onJoin: () => void;
}) {
  const canJoin = s.state === "open" || s.state === "live";
  const tone = s.state === "live" ? "success" : s.state === "cancelled" ? "error" : "muted";
  const { month, day } = dateBlock(s.startsAt);
  return (
    <View
      testID={`live-${s.id}`}
      style={{
        ...raised,
        borderColor: s.state === "live" ? status.success : raised.borderColor,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 56,
          alignSelf: "flex-start",
          alignItems: "center",
          paddingVertical: spacing.sm,
          borderRadius: 12,
          backgroundColor: colors.blueTint,
        }}
      >
        <Text variant="caption" tone="link" style={{ fontWeight: "700" }}>
          {month}
        </Text>
        <Text variant="heading">{day}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        {showCourse ? (
          <Text variant="caption" tone="muted">
            {s.courseTitle}
          </Text>
        ) : null}
        <Text variant="subheading">{s.title}</Text>
        <Text>
          {whenText(s.startsAt)} · {durationText(s.durationMinutes)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          {s.state === "live" ? (
            <LiveDot />
          ) : (
            <Feather name="video" size={13} color={colors.blue} accessible={false} />
          )}
          <Text variant="caption" tone={tone} style={{ flexShrink: 1 }}>
            {STATE_TEXT[s.state]}
            {s.state === "upcoming" ? ` · Join opens ${whenText(s.joinOpensAt)}` : ""}
          </Text>
        </View>
        {s.state === "cancelled" && s.cancelReason ? (
          <Text tone="muted">Reason: {s.cancelReason}</Text>
        ) : null}
        {s.description && s.state !== "cancelled" && s.state !== "ended" ? (
          <Text tone="muted">{s.description}</Text>
        ) : null}
        {canJoin ? (
          <Button
            label="Join class"
            accessibilityLabel={`Join ${s.title}`}
            loading={joining}
            onPress={onJoin}
          />
        ) : null}
      </View>
    </View>
  );
}
