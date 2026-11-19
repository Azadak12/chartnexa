import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
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
import { MenuGroup, ProfileMenuRow } from "../../kit/Rows";
import { colors, spacing, status as statusColors } from "../../theme";
import { BottomSheet, Banner, Button, Card, Screen, Text, useSubmitOnce } from "../../ui";
import { demoAccountsEnabled } from "../../dev/demo-accounts";
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

/** Two letters for the avatar: from the name when there is one, else from the email. */
export function initialsOf(name: string | null, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
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
  const staffRows: {
    label: string;
    icon: React.ComponentProps<typeof Feather>["name"];
    href: Href;
  }[] = [
    canManageCourses(access.data) && {
      label: "Manage courses",
      icon: "book-open",
      href: "/manage",
    },
    canManageInstructors(access.data) && {
      label: "Instructor permissions",
      icon: "users",
      href: "/profile/instructors",
    },
    canModerateReviews(access.data) && {
      label: "Review moderation",
      icon: "message-square",
      href: "/profile/reviews",
    },
    canInviteInstructors(access.data) && {
      label: "Invite instructors",
      icon: "user-plus",
      href: "/profile/invitations",
    },
    canPublishAnnouncements(access.data) && {
      label: "Post announcements",
      icon: "volume-2",
      href: "/profile/staff-announcements",
    },
    canReadPayments(access.data) && {
      label: "Orders",
      icon: "credit-card",
      href: "/profile/orders",
    },
    canReadAudit(access.data) && { label: "Audit log", icon: "clipboard", href: "/profile/audit" },
  ].filter((r): r is NonNullable<typeof r> => !!r) as never;
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  testID="profile-avatar"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: colors.blue,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text variant="heading" tone="onBlue">
                    {initialsOf(me.displayName, me.email)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="subheading" numberOfLines={1}>
                    {me.displayName ?? "No name set"}
                  </Text>
                  <Text tone="muted" numberOfLines={1}>
                    {me.email}
                  </Text>
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
                </View>
              </View>
            </Card>
            {!me.emailVerified ? <VerifyNotice /> : null}

            <MenuGroup title="Account">
              <View ref={editRef} collapsable={false}>
                <ProfileMenuRow icon="edit-2" label="Edit name" onPress={() => setEditing(true)} />
              </View>
              <ProfileMenuRow
                icon="bell"
                label="Announcements"
                onPress={() => router.push("/profile/announcements")}
                last
              />
            </MenuGroup>

            <MenuGroup title="Learning & Purchases">
              <ProfileMenuRow
                icon="shopping-bag"
                label="Purchases"
                onPress={() => router.push("/profile/purchases")}
                last
              />
            </MenuGroup>

            <MenuGroup title="Security">
              <ProfileMenuRow
                icon="lock"
                label="Change password"
                onPress={() => router.push("/profile/change-password")}
              />
              {mfa.data?.required ? (
                <ProfileMenuRow
                  icon="shield"
                  label={`Two-step sign-in: ${mfa.data.enabled ? "On" : "Off"}`}
                  onPress={() => router.push("/profile/two-step")}
                />
              ) : null}
              <ProfileMenuRow
                icon="smartphone"
                label="Active sessions"
                onPress={() => router.push("/profile/sessions")}
                last
              />
            </MenuGroup>

            {staffRows.length > 0 ? (
              <MenuGroup title="Staff tools">
                {staffRows.map((r, i) => (
                  <ProfileMenuRow
                    key={r.label}
                    icon={r.icon}
                    label={r.label}
                    onPress={() => router.push(r.href)}
                    last={i === staffRows.length - 1}
                  />
                ))}
              </MenuGroup>
            ) : null}
            {demoAccountsEnabled() ? (
              <MenuGroup title="Development">
                <ProfileMenuRow
                  icon="users"
                  label="Demo accounts"
                  onPress={() => router.push("/demo-accounts")}
                  last
                />
              </MenuGroup>
            ) : null}
            {testServer.allowed() ? (
              <Text variant="caption" tone="muted" testID="profile-build-label">
                {buildLabel()}
              </Text>
            ) : null}
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
