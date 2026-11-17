import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import type { SessionSummary } from "@chartnexa/api-contracts";
import { QueryStateView } from "../../state/StateView";
import { colors } from "../../theme";
import { Button, Card, Screen, Text } from "../../ui";
import { accountApi } from "../account-api";
import { ConfirmDialog } from "../ConfirmDialog";
import { sessionManager } from "../session-manager";

const when = (iso: string) => new Date(iso).toLocaleString();

export function SessionsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["sessions"], queryFn: accountApi.listSessions });
  const [ending, setEnding] = useState<SessionSummary | null>(null);
  const [everywhere, setEverywhere] = useState(false);
  const everywhereRef = useRef(null);

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Active sessions
      </Text>
      <QueryStateView query={query} isEmpty={(d) => d.length === 0} emptyTitle="No active sessions">
        {(sessions) => (
          <>
            {sessions.map((s) => (
              <Card key={s.id} testID={`session-${s.id}`}>
                <Text variant="subheading">{s.deviceLabel ?? "Unknown device"}</Text>
                <Text variant="caption" tone="muted">
                  Started {when(s.createdAt)}
                </Text>
                <Text variant="caption" tone="muted">
                  Last used {when(s.lastUsedAt)}
                </Text>
                {s.current ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="smartphone" size={16} color={colors.blue} accessible={false} />
                    <Text variant="caption" tone="link">
                      This device
                    </Text>
                  </View>
                ) : (
                  <Button
                    label={`End session on ${s.deviceLabel ?? "device"}`}
                    variant="secondary"
                    onPress={() => setEnding(s)}
                  />
                )}
              </Card>
            ))}
            <ConfirmDialog
              visible={ending !== null}
              title="End this session?"
              message={`${ending?.deviceLabel ?? "That device"} will be signed out the next time it contacts the server.`}
              confirmLabel="End session"
              onCancel={() => setEnding(null)}
              onConfirm={async () => {
                if (!ending) return;
                await accountApi.revokeSession(ending.id);
                setEnding(null);
                await qc.invalidateQueries({ queryKey: ["sessions"] });
              }}
            />
          </>
        )}
      </QueryStateView>
      <View ref={everywhereRef} collapsable={false}>
        <Button
          label="Sign out of all devices"
          variant="secondary"
          onPress={() => setEverywhere(true)}
        />
      </View>
      <ConfirmDialog
        visible={everywhere}
        title="Sign out everywhere?"
        message="Every device, including this one, will be signed out and will need your password to sign in again."
        confirmLabel="Sign out of all devices"
        openerRef={everywhereRef}
        onCancel={() => setEverywhere(false)}
        onConfirm={async () => {
          await accountApi.logoutEverywhere();
          setEverywhere(false);
          await sessionManager.clearAfterServerEnd("You were signed out of all devices.");
        }}
      />
      <Button label="Back" variant="tertiary" onPress={() => router.back()} />
    </Screen>
  );
}
