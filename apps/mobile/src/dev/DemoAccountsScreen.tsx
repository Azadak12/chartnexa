import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { accountApi } from "../auth/account-api";
import { sessionManager } from "../auth/session-manager";
import { BackButton } from "../kit/BackButton";
import { useSession } from "../session/session-store";
import { colors, neutrals, radii, spacing } from "../theme";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../ui";
import { DEMO_ACCOUNTS, demoAccountsEnabled, type DemoAccount } from "./demo-accounts";

/**
 * Five cards, one per test account. "Sign in" fills the public email and opens the normal secure
 * sign-in. Switching from another account signs out first, through the normal sign-out. The
 * password, and for staff the two-step code, are always asked for.
 */
export function DemoAccountsScreen() {
  const router = useRouter();
  const { status } = useSession();
  const signedIn = status === "signed-in";
  const me = useQuery({
    queryKey: ["me"],
    queryFn: accountApi.me,
    enabled: signedIn && demoAccountsEnabled(),
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/sign-in"));
  const pick = useSubmitOnce(async (a: DemoAccount) => {
    if (signedIn) await sessionManager.signOut();
    router.replace({ pathname: "/sign-in", params: { email: a.email } });
  });

  if (!demoAccountsEnabled()) {
    return (
      <Screen>
        <BackButton onPress={back} />
        <Text variant="title" accessibilityRole="header">
          Not available
        </Text>
        <Text tone="muted">Demo accounts are only offered in development and demo builds.</Text>
      </Screen>
    );
  }
  return (
    <Screen>
      <BackButton onPress={back} />
      <Text variant="title" accessibilityRole="header">
        Demo accounts
      </Text>
      <Banner
        kind="info"
        message="For testing only. Pick a role to open the normal sign-in with its email filled in. You still enter the password."
        testID="demo-note"
      />
      {DEMO_ACCOUNTS.map((a) => {
        const current = signedIn && me.data?.email === a.email;
        return (
          <View
            key={a.role}
            testID={`demo-${a.role}`}
            style={{
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radii.card,
              borderWidth: 1,
              borderColor: current ? colors.blue : neutrals.divider,
              backgroundColor: colors.surface,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text variant="subheading" accessibilityRole="header" style={{ flex: 1 }}>
                {a.title}
              </Text>
              {current ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  testID={`demo-${a.role}-current`}
                >
                  <Feather name="check-circle" size={16} color={colors.blue} accessible={false} />
                  <Text variant="caption" tone="link">
                    Signed in
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="caption" tone="muted" selectable>
              {a.email}
            </Text>
            <Text>{a.summary}</Text>
            {a.twoStep ? (
              <Text variant="caption" tone="warning">
                Asks for a two-step code, unless the local server has the development shortcut on.
              </Text>
            ) : null}
            <Button
              label={current ? `Signed in as ${a.title}` : `Sign in as ${a.title}`}
              variant={current ? "secondary" : "primary"}
              disabled={current}
              loading={pick.pending}
              onPress={() => void pick.run(a)}
            />
          </View>
        );
      })}
    </Screen>
  );
}
