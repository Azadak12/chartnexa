import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import type {
  ManagedRole,
  PermissionUserSummary,
  RoleDefaultsEntry,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canManageRoles, fetchAccess } from "../courses/course-api";
import { ReasonSheet } from "../instructors/ReasonSheet";
import { SearchBar } from "../kit/SearchBar";
import { SegmentedControl } from "../kit/SegmentedControl";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, spacing } from "../theme";
import { Banner, Button, Card, Screen, Text } from "../ui";
import { ROLE_LABEL } from "./labels";
import { PermissionSwitchRow } from "./PermissionSwitchRow";
import { permissionApi } from "./permission-api";

type Tab = ManagedRole | "roles";
const TABS: readonly { key: Tab; label: string }[] = [
  { key: "instructor", label: "Instructors" },
  { key: "manager", label: "Managers" },
  { key: "student", label: "Students" },
  { key: "roles", label: "Roles" },
];

/** Admin only: find a person to manage, or change what each role gets by default. */
export function PermissionDirectoryScreen() {
  const router = useRouter();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const [tab, setTab] = useState<Tab>("instructor");
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(text), 300);
    return () => clearTimeout(t);
  }, [text]);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/profile"));

  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error") {
    return (
      <Screen>
        <StateView
          state="error"
          message={isAppError(access.error) ? access.error.message : messageFor("unknown")}
          onAction={() => void access.refetch()}
        />
      </Screen>
    );
  }
  if (!canManageRoles(access.data)) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="Only Admins can manage permissions."
          actionLabel="Back"
          onAction={goBack}
        />
      </Screen>
    );
  }
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Permission management
      </Text>
      <Text tone="muted">
        Choose a person to see what they can do, or open Roles to change what a whole role gets.
        Only Admins can do this, and every change is recorded with a reason.
      </Text>
      <SegmentedControl options={TABS} value={tab} onChange={setTab} testID="permission-tabs" />
      {tab === "roles" ? (
        <RoleDefaultsPanel />
      ) : (
        <>
          {tab === "instructor" ? (
            <Text variant="caption" tone="muted">
              Lecturers have the Instructor role, so they are listed here.
            </Text>
          ) : null}
          <SearchBar
            value={text}
            onChangeText={setText}
            placeholder={`Search ${ROLE_LABEL[tab].toLowerCase()}s by name or email`}
            label={`Search ${ROLE_LABEL[tab].toLowerCase()}s`}
          />
          <PersonList role={tab} term={term.trim()} />
        </>
      )}
      <Button label="Back" variant="tertiary" onPress={goBack} />
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

function PersonList({ role, term }: { role: ManagedRole; term: string }) {
  const router = useRouter();
  const q = useInfiniteQuery({
    queryKey: ["permission-users", role, term],
    queryFn: ({ pageParam }) => permissionApi.users(role, term, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  });
  if (q.status === "pending") return <StateView state="loading" />;
  if (q.status === "error") {
    return (
      <StateView
        state="error"
        message={isAppError(q.error) ? q.error.message : messageFor("unknown")}
        onAction={() => void q.refetch()}
      />
    );
  }
  const people: PermissionUserSummary[] = q.data.pages.flatMap((p) => p.items);
  if (people.length === 0) {
    return (
      <StateView
        state="empty"
        title={term ? "No matches" : `No ${ROLE_LABEL[role].toLowerCase()}s yet`}
        message={term ? "Try a different name or email." : "Nobody has this role yet."}
      />
    );
  }
  return (
    <View style={{ gap: spacing.sm }} testID="person-list">
      {people.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={`${p.displayName ?? "No name set"}, ${ROLE_LABEL[p.role]}`}
          testID={`person-${p.id}`}
          onPress={() => router.push(`/profile/permissions/${p.id}`)}
          style={({ pressed }) => ({
            minHeight: 56,
            padding: spacing.md,
            borderRadius: radii.control,
            borderWidth: 1,
            borderColor: neutrals.divider,
            backgroundColor: pressed ? neutrals.surface : colors.white,
            gap: 2,
          })}
        >
          <Text variant="bodyStrong">{p.displayName ?? "No name set"}</Text>
          {p.email ? (
            <Text variant="caption" tone="muted">
              {p.email}
            </Text>
          ) : null}
        </Pressable>
      ))}
      {q.hasNextPage ? (
        <Button
          label="Show more"
          variant="secondary"
          loading={q.isFetchingNextPage}
          onPress={() => void q.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}

function RoleDefaultsPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["permission-roles"],
    queryFn: permissionApi.roles,
    retry: false,
  });
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<RoleDefaultsEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const saveRef = useRef(null);
  useEffect(() => {
    if (!q.data) return;
    const next: Record<string, boolean> = {};
    for (const r of q.data.roles)
      for (const p of r.permissions) next[`${r.role}|${p.permission}`] = p.enabled;
    setDraft(next);
  }, [q.data]);

  if (q.status === "pending") return <StateView state="loading" />;
  if (q.status === "error") {
    return (
      <StateView
        state="error"
        message={isAppError(q.error) ? q.error.message : messageFor("unknown")}
        onAction={() => void q.refetch()}
      />
    );
  }
  const changesFor = (r: RoleDefaultsEntry) =>
    r.permissions
      .filter((p) => (draft[`${r.role}|${p.permission}`] ?? p.enabled) !== p.enabled)
      .map((p) => ({
        permission: p.permission,
        enabled: draft[`${r.role}|${p.permission}`] ?? p.enabled,
      }));
  return (
    <View style={{ gap: spacing.md }} testID="role-defaults">
      <Text tone="muted">
        What everyone with a role gets. A person can still be switched individually on their own
        page. Admin permissions, and the four restricted ones (roles, audit log, full payments and
        permission management), are never listed.
      </Text>
      {notice ? <Banner kind="success" message={notice} testID="roles-notice" /> : null}
      {q.data.roles.map((r) => {
        const changes = changesFor(r);
        return (
          <Card key={r.role} testID={`role-${r.role}`}>
            <Text variant="subheading" accessibilityRole="header">
              {ROLE_LABEL[r.role]}
            </Text>
            {r.role === "instructor" ? (
              <Text variant="caption" tone="muted">
                Course permissions are never a role default: they are given per course.
              </Text>
            ) : null}
            {r.permissions.map((p) => {
              const key = `${r.role}|${p.permission}`;
              const on = draft[key] ?? p.enabled;
              return (
                <PermissionSwitchRow
                  key={key}
                  testID={`roleperm-${r.role}-${p.permission}`}
                  label={p.label}
                  help={p.help}
                  value={on}
                  source="role"
                  sourceText={p.enabled === p.builtIn ? "Built-in default" : "Changed by an Admin"}
                  expiresAt={null}
                  changed={on !== p.enabled}
                  onChange={(v) => setDraft((s) => ({ ...s, [key]: v }))}
                />
              );
            })}
            <View ref={saveRef} collapsable={false}>
              <Button
                label={`Save ${ROLE_LABEL[r.role]} defaults`}
                disabled={changes.length === 0}
                onPress={() => setSaving(r)}
              />
            </View>
          </Card>
        );
      })}
      <ReasonSheet
        visible={saving !== null}
        title="Save role defaults"
        message={`This changes what every ${saving ? ROLE_LABEL[saving.role] : ""} gets, immediately. It is recorded in the audit log.`}
        confirmLabel="Save"
        openerRef={saveRef}
        onCancel={() => setSaving(null)}
        onConfirm={async (reason) => {
          if (!saving) return;
          await permissionApi.saveRole(saving.role, { reason, changes: changesFor(saving) });
          setNotice(`${ROLE_LABEL[saving.role]} defaults saved.`);
          setSaving(null);
          await qc.invalidateQueries({ queryKey: ["permission-roles"] });
        }}
      />
    </View>
  );
}
