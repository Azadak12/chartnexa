import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import {
  PERMISSION_CATALOG,
  type PermissionChange,
  type PermissionUserDetail,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canManageRoles, fetchAccess } from "../courses/course-api";
import { StateView } from "../state/StateView";
import { spacing } from "../theme";
import { Banner, BottomSheet, Button, Card, Chip, Screen, Text } from "../ui";
import { ReasonSheet } from "../instructors/ReasonSheet";
import { EXPIRY_CHOICES, ROLE_LABEL, expiryIso, type ExpiryKey } from "./labels";
import { PermissionSwitchRow } from "./PermissionSwitchRow";
import { permissionApi } from "./permission-api";

const COURSE_PERMISSIONS = PERMISSION_CATALOG.filter((c) => c.scope === "course");
const courseKey = (courseId: string, permission: string) => `${courseId}|${permission}`;

/**
 * One person's permissions: what their role gives them, what was granted to them individually,
 * switches to change either, an optional end date, and a reason that goes into the audit log.
 * Nothing changes until Save; the server checks everything again and refuses anything unsafe.
 */
export function PermissionPersonScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canManageRoles(access.data);
  const q = useQuery({
    queryKey: ["permission-user", userId],
    enabled: allowed,
    queryFn: () => permissionApi.detail(userId),
    retry: false,
  });
  const data: PermissionUserDetail | undefined = q.data;

  const [person, setPerson] = useState<Record<string, boolean>>({});
  const [course, setCourse] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Array<{ id: string; title: string }>>([]);
  const [expiry, setExpiry] = useState<ExpiryKey>("never");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const saveRef = useRef(null);
  const addRef = useRef(null);

  // Start every switch from what the server says now (also after a save or a reload).
  useEffect(() => {
    if (!data) return;
    setPerson(Object.fromEntries(data.permissions.map((p) => [p.permission, p.enabled])));
    setCourse(
      Object.fromEntries(data.courseGrants.map((g) => [courseKey(g.courseId, g.permission), true])),
    );
    setAdded([]);
  }, [data]);

  const courses = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const g of data.courseGrants) seen.set(g.courseId, g.courseTitle);
    for (const a of added) seen.set(a.id, a.title);
    return [...seen].map(([cid, title]) => ({ id: cid, title }));
  }, [data, added]);

  const changes = useMemo<PermissionChange[]>(() => {
    if (!data) return [];
    const at = expiryIso(expiry);
    const out: PermissionChange[] = [];
    for (const p of data.permissions) {
      const next = person[p.permission] ?? p.enabled;
      if (next === p.enabled) continue;
      const timed = next ? !p.roleDefault : p.roleDefault;
      out.push({
        permission: p.permission,
        enabled: next,
        ...(timed && at ? { expiresAt: at } : {}),
      });
    }
    for (const c of courses) {
      for (const cp of COURSE_PERMISSIONS) {
        const key = courseKey(c.id, cp.permission);
        const was = data.courseGrants.some(
          (g) => g.courseId === c.id && g.permission === cp.permission,
        );
        const next = course[key] ?? false;
        if (next === was) continue;
        out.push({
          permission: cp.permission,
          courseId: c.id,
          enabled: next,
          ...(next && at ? { expiresAt: at } : {}),
        });
      }
    }
    return out;
  }, [data, person, course, courses, expiry]);

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/profile/permissions");

  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (!allowed) {
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
  if (q.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (q.status === "error" || !data) {
    const gone =
      isAppError(q.error) && (q.error.kind === "not_found" || q.error.kind === "forbidden");
    return (
      <Screen>
        <StateView
          state={gone ? "empty" : "error"}
          {...(gone
            ? {
                title: "Not available",
                message:
                  "This account cannot be managed here (it may be an Admin or no longer active).",
              }
            : { message: isAppError(q.error) ? q.error.message : messageFor("unknown") })}
          actionLabel={gone ? "Back" : "Retry"}
          onAction={gone ? goBack : () => void q.refetch()}
        />
      </Screen>
    );
  }

  const name = data.user.displayName ?? "No name set";
  const isInstructor = data.user.role === "instructor";
  const pickable = data.availableCourses.filter((c) => !courses.some((x) => x.id === c.id));
  const timedHint = changes.some((c) => c.expiresAt) || expiry !== "never";

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header" testID="person-name">
        {name}
      </Text>
      <Text tone="muted" testID="person-role">
        {ROLE_LABEL[data.user.role]}
        {data.user.email ? ` · ${data.user.email}` : ""}
      </Text>
      {notice ? <Banner kind="success" message={notice} testID="person-notice" /> : null}

      <Card>
        <Text variant="subheading">Permissions</Text>
        <Text variant="caption" tone="muted">
          Each one says whether it comes from the role (everyone with this role has it) or was given
          to this person individually.
        </Text>
        {data.permissions.map((p) => (
          <PermissionSwitchRow
            key={p.permission}
            testID={`perm-${p.permission}`}
            label={p.label}
            help={p.help}
            value={person[p.permission] ?? p.enabled}
            source={p.source}
            expiresAt={p.expiresAt}
            disabled={!p.changeable}
            lockedReason={p.lockedReason}
            changed={(person[p.permission] ?? p.enabled) !== p.enabled}
            onChange={(v) => setPerson((s) => ({ ...s, [p.permission]: v }))}
          />
        ))}
      </Card>

      {isInstructor ? (
        <Card>
          <Text variant="subheading">Courses this person works on</Text>
          <Text variant="caption" tone="muted">
            Course permissions apply only to the courses listed here, never to the whole academy.
          </Text>
          {courses.length === 0 ? (
            <Text testID="no-courses">
              No courses yet. Add a course to give course permissions.
            </Text>
          ) : null}
          {courses.map((c) => (
            <View key={c.id} testID={`course-${c.id}`} style={{ gap: spacing.xs }}>
              <Text variant="bodyStrong" accessibilityRole="header">
                {c.title}
              </Text>
              {COURSE_PERMISSIONS.map((cp) => {
                const key = courseKey(c.id, cp.permission);
                const grant = data.courseGrants.find(
                  (g) => g.courseId === c.id && g.permission === cp.permission,
                );
                const on = course[key] ?? false;
                return (
                  <PermissionSwitchRow
                    key={key}
                    testID={`course-perm-${c.id}-${cp.permission}`}
                    label={cp.label}
                    value={on}
                    source={grant ? "individual" : "none"}
                    sourceText={
                      grant
                        ? grant.source === "owner_auto"
                          ? "Given when they created this course"
                          : "Individual grant"
                        : "Not given"
                    }
                    expiresAt={grant?.expiresAt ?? null}
                    changed={on !== !!grant}
                    onChange={(v) => setCourse((s) => ({ ...s, [key]: v }))}
                  />
                );
              })}
            </View>
          ))}
          <View ref={addRef} collapsable={false}>
            <Button
              label="Add a course"
              variant="secondary"
              onPress={() => setPicking(true)}
              disabled={pickable.length === 0}
            />
          </View>
        </Card>
      ) : null}

      {data.user.role === "student" ? (
        <Card>
          <Text variant="subheading">Course access</Text>
          <Text variant="caption" tone="muted" testID="access-note">
            Permission switches never give or remove course access. Purchases and enrollments are
            managed on each course.
          </Text>
          {data.courseAccess.length === 0 ? (
            <Text testID="no-access">This student has no courses yet.</Text>
          ) : (
            data.courseAccess.map((a) => (
              <View key={a.entitlementId} testID={`access-${a.courseId}`}>
                <Text variant="bodyStrong">{a.courseTitle}</Text>
                <Text variant="caption" tone="muted">
                  {a.source === "admin_grant" ? "Given by an Admin" : "Purchased"}
                </Text>
              </View>
            ))
          )}
          <Button
            label="Manage course access"
            variant="secondary"
            onPress={() => router.push("/manage")}
          />
        </Card>
      ) : null}

      <Card>
        <Text variant="subheading">End date for what you change now</Text>
        <Text variant="caption" tone="muted">
          Optional. Applies to individual grants and switch-offs in this save, for example for a
          guest Lecturer.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {EXPIRY_CHOICES.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected={expiry === c.key}
              onPress={() => setExpiry(c.key)}
            />
          ))}
        </View>
      </Card>

      <View ref={saveRef} collapsable={false}>
        <Button
          label={
            changes.length > 0
              ? `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`
              : "Save changes"
          }
          disabled={changes.length === 0}
          onPress={() => setSaving(true)}
        />
      </View>
      {changes.length === 0 ? (
        <Text variant="caption" tone="muted" testID="no-changes">
          Nothing to save yet.
        </Text>
      ) : null}
      <Button
        label="Reload"
        variant="tertiary"
        onPress={() => {
          setNotice(null);
          void q.refetch();
        }}
      />
      <Button label="Back" variant="tertiary" onPress={goBack} />

      <ReasonSheet
        visible={saving}
        title="Save permission changes"
        message={`${changes.length} change${changes.length === 1 ? "" : "s"} for ${name}. They take effect immediately and are recorded in the audit log${timedHint ? " with the end date you chose" : ""}.`}
        confirmLabel="Save"
        openerRef={saveRef}
        onCancel={() => setSaving(false)}
        onConfirm={async (reason) => {
          await permissionApi.save(userId, {
            reason,
            expectedVersion: data.version,
            changes,
          });
          setSaving(false);
          setExpiry("never");
          setNotice(`Saved. ${name}'s permissions are updated.`);
          await qc.invalidateQueries({ queryKey: ["permission-user", userId] });
        }}
      />
      <BottomSheet
        visible={picking}
        title="Add a course"
        onDismiss={() => setPicking(false)}
        openerRef={addRef}
      >
        <Text>Choose a course to give this person permissions on.</Text>
        {pickable.map((c) => (
          <Button
            key={c.id}
            label={c.title}
            variant="secondary"
            onPress={() => {
              setAdded((a) => [...a, c]);
              setPicking(false);
            }}
          />
        ))}
        <Button label="Cancel" variant="tertiary" onPress={() => setPicking(false)} />
      </BottomSheet>
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
