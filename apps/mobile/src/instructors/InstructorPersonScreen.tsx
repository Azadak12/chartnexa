import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import type { Grant } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { StateView } from "../state/StateView";
import { spacing } from "../theme";
import { Banner, Button, Card, Screen, Text } from "../ui";
import { canManageInstructors, fetchAccess, isAdmin } from "../courses/course-api";
import { AddPermissionSheet } from "./AddPermissionSheet";
import { instructorApi } from "./instructor-api";
import { labelFor } from "./labels";
import { ReasonSheet } from "./ReasonSheet";

/** One Instructor: what they may do, add or remove permissions, and (Admins) end the role. */
export function InstructorPersonScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const perms = useQuery({
    queryKey: ["instructor-permissions", userId],
    enabled: canManageInstructors(access.data),
    queryFn: () => instructorApi.permissions(userId),
    retry: false,
  });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Grant | null>(null);
  const [ending, setEnding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const addRef = useRef(null);
  const endRef = useRef(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/profile"));
  const refresh = () => qc.invalidateQueries({ queryKey: ["instructor-permissions", userId] });

  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (!canManageInstructors(access.data)) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="Only Admins and Managers can manage Instructor permissions."
          actionLabel="Back"
          onAction={goBack}
        />
      </Screen>
    );
  }
  if (perms.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (perms.status === "error") {
    const notFound = isAppError(perms.error) && perms.error.kind === "not_found";
    return (
      <Screen>
        <StateView
          state={notFound ? "empty" : "error"}
          {...(notFound
            ? { title: "Not an Instructor", message: "This person is not an active Instructor." }
            : {
                message: isAppError(perms.error) ? perms.error.message : messageFor("unknown"),
              })}
          actionLabel={notFound ? "Back" : "Retry"}
          onAction={notFound ? goBack : () => void perms.refetch()}
        />
      </Screen>
    );
  }

  const data = perms.data;
  const name = data.displayName ?? "This Instructor";
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {name}
      </Text>
      <Text tone="muted">Instructor</Text>
      {notice ? <Banner kind="success" message={notice} testID="person-notice" /> : null}
      <View ref={addRef} collapsable={false}>
        <Button label="Add permission" onPress={() => setAdding(true)} />
      </View>
      {data.grants.length === 0 ? (
        <Card>
          <Text testID="no-grants">
            {name} cannot do anything yet. Add a permission to let them work on courses.
          </Text>
        </Card>
      ) : (
        data.grants.map((g) => (
          <Card key={g.id}>
            <Text variant="subheading">{labelFor(g.permission)}</Text>
            {g.courseTitle ? <Text>Course: {g.courseTitle}</Text> : <Text>All courses</Text>}
            <Text variant="caption" tone="muted">
              {g.source === "owner_auto"
                ? "Given automatically when they created the course"
                : g.reason}
            </Text>
            <Button
              label="Remove"
              variant="secondary"
              accessibilityLabel={`Remove ${labelFor(g.permission)}${g.courseTitle ? ` for ${g.courseTitle}` : ""}`}
              onPress={() => setRemoving(g)}
            />
          </Card>
        ))
      )}
      {isAdmin(access.data) ? (
        <View ref={endRef} collapsable={false}>
          <Button
            label="Remove Instructor role"
            variant="tertiary"
            onPress={() => setEnding(true)}
          />
        </View>
      ) : null}
      <Button label="Back" variant="tertiary" onPress={goBack} />
      <View style={{ height: spacing.xl }} />

      <AddPermissionSheet
        visible={adding}
        instructorId={userId}
        grantable={data.grantable}
        openerRef={addRef}
        onCancel={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
          setNotice("Permission added.");
          void refresh();
        }}
      />
      <ReasonSheet
        visible={removing !== null}
        title="Remove permission"
        message={
          removing
            ? `${name} will no longer be able to: ${labelFor(removing.permission).toLowerCase()}${removing.courseTitle ? ` (${removing.courseTitle})` : ""}. This takes effect immediately.`
            : ""
        }
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={async (reason) => {
          if (!removing) return;
          await instructorApi.revokeGrant(userId, removing.id, reason);
          setRemoving(null);
          setNotice("Permission removed.");
          await refresh();
        }}
      />
      <ReasonSheet
        visible={ending}
        title="Remove Instructor role"
        message={`${name} stops being an Instructor and every permission they have ends right away.`}
        confirmLabel="Remove role"
        openerRef={endRef}
        onCancel={() => setEnding(false)}
        onConfirm={async (reason) => {
          await instructorApi.removeInstructorRole(userId, reason);
          setEnding(false);
          await qc.invalidateQueries({ queryKey: ["instructor-permissions", userId] });
          goBack();
        }}
      />
    </Screen>
  );
}
