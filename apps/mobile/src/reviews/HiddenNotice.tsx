import { useRef, useState } from "react";
import { View } from "react-native";
import { type ModerationState } from "@chartnexa/api-contracts";
import { Banner, Button, Text } from "../ui";
import { spacing } from "../theme";
import { AppealSheet } from "./AppealSheet";
import { REASON_LABEL } from "./moderation-labels";

/** What the author sees about their own hidden review. State is stated in words, not color. */
export function HiddenNotice({
  courseId,
  moderation,
}: {
  courseId: string;
  moderation: ModerationState;
}) {
  const [appealing, setAppealing] = useState(false);
  const ref = useRef(null);
  const a = moderation.appeal;
  return (
    <View style={{ gap: spacing.sm }} testID="hidden-notice">
      <Banner
        kind="warning"
        message="Hidden from other students. Only you can see this review."
        testID="hidden-banner"
      />
      <Text accessibilityRole="text" testID="hidden-reason">
        Reason: {REASON_LABEL[moderation.reason]}
      </Text>
      {moderation.note ? (
        <Text testID="hidden-note">Note from the moderator: {moderation.note}</Text>
      ) : null}
      {a?.status === "open" ? (
        <Text variant="bodyStrong" testID="appeal-status">
          Appeal sent. A moderator will decide.
        </Text>
      ) : null}
      {a?.status === "upheld" ? (
        <Text variant="bodyStrong" testID="appeal-status">
          Appeal decided: the review stays hidden.
          {a.decidedNote ? ` Moderator's note: ${a.decidedNote}` : ""}
        </Text>
      ) : null}
      {moderation.canAppeal ? (
        <View ref={ref} collapsable={false}>
          <Button
            label="Appeal this decision"
            variant="secondary"
            onPress={() => setAppealing(true)}
          />
        </View>
      ) : null}
      <AppealSheet
        courseId={courseId}
        visible={appealing}
        onClose={() => setAppealing(false)}
        openerRef={ref}
      />
    </View>
  );
}
