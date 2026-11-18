import { useState } from "react";
import { Pressable, Share, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, MIN_TOUCH_SIZE, neutrals, radii, spacing } from "../../theme";
import { Banner, Button, Card, Text } from "../../ui";

/**
 * The 10 recovery codes as plain text. They are shown once: this view never stores them, and the
 * share button hands them to the person's own choice of app (notes, a password manager).
 */
export function RecoveryCodesView({
  codes,
  continueLabel,
  onContinue,
  requireAcknowledgement = true,
}: {
  codes: string[];
  continueLabel: string;
  onContinue: () => void;
  requireAcknowledgement?: boolean;
}) {
  const [saved, setSaved] = useState(!requireAcknowledgement);
  const [message, setMessage] = useState<string | null>(null);
  const share = async () => {
    setMessage(null);
    try {
      await Share.share({
        message: `ChartNexa recovery codes (each works once):\n${codes.join("\n")}`,
      });
    } catch {
      setMessage("Sharing did not work. Write the codes down instead.");
    }
  };
  return (
    <View style={{ gap: spacing.md }}>
      <Text>
        Keep these in a safe place. Each code works once if you lose your phone. We cannot show them
        again.
      </Text>
      <Card>
        <View
          accessible
          accessibilityLabel={`Recovery codes: ${codes.map((c) => c.replaceAll("-", " ")).join(", ")}`}
          testID="recovery-codes"
          style={{ gap: spacing.xs }}
        >
          {codes.map((c, i) => (
            <Text key={c} variant="bodyStrong" selectable importantForAccessibility="no">
              {i + 1}. {c}
            </Text>
          ))}
        </View>
      </Card>
      {message ? <Banner kind="warning" message={message} testID="share-error" /> : null}
      <Button label="Copy or share codes" variant="secondary" onPress={() => void share()} />
      {requireAcknowledgement ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: saved }}
          accessibilityLabel="I saved these codes"
          onPress={() => setSaved((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            minHeight: MIN_TOUCH_SIZE,
            padding: spacing.sm,
            borderRadius: radii.control,
            borderWidth: 1,
            borderColor: neutrals.divider,
          }}
          testID="saved-codes"
        >
          <Feather
            name={saved ? "check-square" : "square"}
            size={24}
            color={colors.blue}
            accessible={false}
          />
          <Text>I saved these codes</Text>
        </Pressable>
      ) : null}
      <Button label={continueLabel} disabled={!saved} onPress={onContinue} />
    </View>
  );
}
