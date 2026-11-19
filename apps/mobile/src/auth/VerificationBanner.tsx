import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { spacing, status } from "../theme";
import { Text, useSubmitOnce } from "../ui";
import { accountApi } from "./account-api";
import { formMessage } from "./errors-ui";

/** One compact line about an unverified email, with a resend link. Shown where it matters, not everywhere. */
export function VerificationBanner() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useSubmitOnce(async () => {
    setError(null);
    try {
      await accountApi.resendVerification();
      setSent(true);
    } catch (e) {
      setError(formMessage(e));
    }
  });
  return (
    <View
      testID="verify-notice"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: 12,
        backgroundColor: status.warningTint,
        borderWidth: 1,
        borderColor: status.warning,
      }}
    >
      <Feather name="mail" size={18} color={status.warning} accessible={false} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" style={{ color: status.warning }}>
          {error ??
            (sent
              ? "Verification email sent. Check your inbox."
              : "Please verify your email to keep your account safe.")}
        </Text>
      </View>
      {!sent ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resend verification email"
          disabled={pending}
          onPress={() => void run()}
          hitSlop={8}
          testID="verify-resend"
        >
          <Text variant="caption" tone="link" style={{ fontWeight: "700" }}>
            {pending ? "Sending…" : "Resend"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
