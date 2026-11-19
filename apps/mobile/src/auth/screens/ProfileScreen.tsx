import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import {
  canManageCourses,
  canInviteInstructors,
  canModerateReviews,
  canPublishAnnouncements,
  canReadAudit,
  canReadPayments,
  canManageInstructors,
  fetchAccess,
} from "../../courses/course-api";
import { applyServerErrors, nameSchema } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { sessionStore } from "../../session/session-store";
import { QueryStateView } from "../../state/StateView";
import { status as statusColors } from "../../theme";
import { BottomSheet, Banner, Button, Card, Screen, Text, useSubmitOnce } from "../../ui";
import { buildLabel } from "../../api/TestServerSheet";
import { testServer } from "../../api/test-server";
import { accountApi } from "../account-api";
import { mfaApi } from "../mfa-api";
import { formMessage } from "../errors-ui";
import { SIGNED_OUT_OFFLINE_NOTICE, sessionManager } from "../session-manager";
import { VerifyNotice } from "../VerifyNotice";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

function EditNameSheet({
  visible,
  current,
  onClose,
  openerRef,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  openerRef: React.RefObject<unknown>;
}) {
  const qc = useQueryClient();
  const { control, handleSubmit, setError, reset } = useZodForm(nameSchema, {
    displayName: current,
  });
  const [message, setMessage] = useState<string | null>(null);
  const { run, pending } = useSubmitOnce(async (v: { displayName: string }) => {
    setMessage(null);
    try {
      await accountApi.updateProfile(v);
      await qc.invalidateQueries({ queryKey: ["me"] });
      onClose();
    } catch (e) {
      if (!applyServerErrors(e, setError, ["displayName"])) setMessage(formMessage(e));
    }
  });
  return (
    <BottomSheet
      visible={visible}
      title="Edit name"
      openerRef={openerRef}
      onDismiss={() => {
        reset({ displayName: current });
        onClose();
      }}
    >
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      <FormField
        control={control}
        name="displayName"
        label="Name"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      <Button
        label="Save"
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v as { displayName: string }))()}
      />
    </BottomSheet>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const query = useQuery({ queryKey: ["me"], queryFn: accountApi.me });
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  // Only Admins and Managers see two-step settings; the server decides who needs it.
  const staffAccess =
    canManageInstructors(access.data) ||
    (access.data?.roles ?? []).some((r) => r === "admin" || r === "manager");
  const mfa = useQuery({ queryKey: ["mfa"], queryFn: mfaApi.status, enabled: staffAccess });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editRef = useRef(null);
  const deleteRef = useRef(null);
  const out = useSubmitOnce(async () => {
    const { serverNotified } = await sessionManager.signOut();
    sessionStore.setNotice(serverNotified ? null : SIGNED_OUT_OFFLINE_NOTICE);
  });

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Profile
      </Text>
      <QueryStateView query={query}>
        {(me) => (
          <>
            <Card>
              <Text variant="subheading">{me.displayName ?? "No name set"}</Text>
              <Text tone="muted">{me.email}</Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                testID="verified-indicator"
              >
                <Feather
                  name={me.emailVerified ? "check-circle" : "alert-triangle"}
                  size={16}
                  color={me.emailVerified ? statusColors.success : statusColors.warning}
                  accessible={false}
                />
                <Text variant="caption" tone={me.emailVerified ? "success" : "warning"}>
                  {me.emailVerified ? "Email verified" : "Email not verified"}
                </Text>
              </View>
            </Card>
            {!me.emailVerified ? <VerifyNotice /> : null}
            <View ref={editRef} collapsable={false}>
              <Button label="Edit name" variant="secondary" onPress={() => setEditing(true)} />
            </View>
            {canManageCourses(access.data) ? (
              <Button label="Manage courses" onPress={() => router.push("/manage")} />
            ) : null}
            {canManageInstructors(access.data) ? (
              <Button
                label="Instructor permissions"
                variant="secondary"
                onPress={() => router.push("/profile/instructors")}
              />
            ) : null}
            {canModerateReviews(access.data) ? (
              <Button
                label="Review moderation"
                variant="secondary"
                onPress={() => router.push("/profile/reviews")}
              />
            ) : null}
            <Button
              label="Announcements"
              variant="secondary"
              onPress={() => router.push("/profile/announcements")}
            />
            {canInviteInstructors(access.data) ? (
              <Button
                label="Invite instructors"
                variant="secondary"
                onPress={() => router.push("/profile/invitations")}
              />
            ) : null}
            {canPublishAnnouncements(access.data) ? (
              <Button
                label="Post announcements"
                variant="secondary"
                onPress={() => router.push("/profile/staff-announcements")}
              />
            ) : null}
            {canReadPayments(access.data) ? (
              <Button
                label="Orders"
                variant="secondary"
                onPress={() => router.push("/profile/orders")}
              />
            ) : null}
            {canReadAudit(access.data) ? (
              <Button
                label="Audit log"
                variant="secondary"
                onPress={() => router.push("/profile/audit")}
              />
            ) : null}
            {mfa.data?.required ? (
              <Button
                label={`Two-step sign-in: ${mfa.data.enabled ? "On" : "Off"}`}
                variant="secondary"
                onPress={() => router.push("/profile/two-step")}
              />
            ) : null}
            {testServer.allowed() ? (
              <Text variant="caption" tone="muted" testID="profile-build-label">
                {buildLabel()}
              </Text>
            ) : null}
            <Button
              label="Change password"
              variant="secondary"
              onPress={() => router.push("/profile/change-password")}
            />
            <Button
              label="Purchases"
              variant="secondary"
              onPress={() => router.push("/profile/purchases")}
            />
            <Button
              label="Active sessions"
              variant="secondary"
              onPress={() => router.push("/profile/sessions")}
            />
            <EditNameSheet
              visible={editing}
              current={me.displayName ?? ""}
              onClose={() => setEditing(false)}
              openerRef={editRef}
            />
          </>
        )}
      </QueryStateView>
      <Button label="Sign out" loading={out.pending} onPress={() => void out.run()} />
      <View ref={deleteRef} collapsable={false}>
        <Button label="Delete account" variant="tertiary" onPress={() => setDeleting(true)} />
      </View>
      <DeleteAccountDialog
        visible={deleting}
        onClose={() => setDeleting(false)}
        openerRef={deleteRef}
      />
      <Text variant="caption" tone="muted">
        Deleting your account removes your personal data and signs you out everywhere.
      </Text>
    </Screen>
  );
}
