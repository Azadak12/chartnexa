import { useQuery } from "@tanstack/react-query";
import { accountApi } from "../../../src/auth/account-api";
import { VerifyNotice } from "../../../src/auth/VerifyNotice";
import { Screen, Text } from "../../../src/ui";
import { StateView } from "../../../src/state/StateView";

export default function Home() {
  const me = useQuery({ queryKey: ["me"], queryFn: accountApi.me });
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {me.data?.displayName ? `Welcome, ${me.data.displayName}` : "Home"}
      </Text>
      {me.data && !me.data.emailVerified ? <VerifyNotice /> : null}
      <StateView
        state="empty"
        title="Courses are coming soon"
        message="The course catalog will appear here."
      />
    </Screen>
  );
}
