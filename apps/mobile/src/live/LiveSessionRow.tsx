import { View } from "react-native";
import type { LiveSession } from "@chartnexa/api-contracts";
import { neutrals, radii, spacing } from "../theme";
import { Button, Text } from "../ui";
import { durationText, STATE_TEXT, whenText } from "./live-api";

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
  return (
    <View
      testID={`live-${s.id}`}
      style={{
        borderWidth: 1,
        borderColor: neutrals.divider,
        borderRadius: radii.card,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      {showCourse ? (
        <Text variant="caption" tone="muted">
          {s.courseTitle}
        </Text>
      ) : null}
      <Text variant="subheading">{s.title}</Text>
      <Text>
        {whenText(s.startsAt)} · {durationText(s.durationMinutes)}
      </Text>
      <Text variant="caption" tone={tone}>
        {STATE_TEXT[s.state]}
        {s.state === "upcoming" ? ` · Join opens ${whenText(s.joinOpensAt)}` : ""}
      </Text>
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
  );
}
