import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import {
  MODULE_TITLE_MAX,
  type StaffCourseModule,
  type StaffLesson,
  type StaffLessonList,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { ConfirmDialog } from "../../auth/ConfirmDialog";
import { canAuthorLessons, fetchAccess } from "../../courses/course-api";
import { StateView } from "../../state/StateView";
import { colors, neutrals, radii, spacing } from "../../theme";
import { Banner, Button, IconButton, NameSheet, Screen, Text } from "../../ui";
import { staffLessonApi } from "../lesson-api";
import { ModulePickerSheet } from "./ModulePickerSheet";

/** Staff lesson list for one course: order, edit, delete. The server checks every request. */
export function StaffLessonsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = String(id);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<StaffLesson | null>(null);
  const deleteOpener = useRef(null);
  const [addingModule, setAddingModule] = useState(false);
  const [renamingModule, setRenamingModule] = useState<StaffCourseModule | null>(null);
  const [deletingModule, setDeletingModule] = useState<StaffCourseModule | null>(null);
  const [picking, setPicking] = useState<StaffLesson | null>(null);
  const addModuleRef = useRef(null);
  const rowOpener = useRef<unknown>(null);
  const rowRefs = useRef<Record<string, unknown>>({});

  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canAuthorLessons(access.data, courseId);
  const query = useQuery({
    queryKey: ["staff-lessons", courseId],
    enabled: allowed,
    queryFn: () => staffLessonApi.list(courseId),
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));
  const items = query.data?.items ?? [];
  const modules = query.data?.modules ?? [];
  const moduleName = (id: string | null) => {
    const m = modules.find((x) => x.id === id);
    return m ? `Module ${m.position}: ${m.title}` : "No module";
  };

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
  if (!allowed) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="You need permission to edit this course's lessons."
          actionLabel="Back"
          onAction={back}
        />
      </Screen>
    );
  }

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["staff-lessons", courseId] });
    await qc.invalidateQueries({ queryKey: ["lessons", courseId] });
    await qc.invalidateQueries({ queryKey: ["course", courseId] });
  };

  const explain = (e: unknown): string => {
    if (isAppError(e) && e.kind === "forbidden") {
      void qc.invalidateQueries({ queryKey: ["access"] });
      return "You no longer have access to this course's lessons.";
    }
    if (isAppError(e) && e.kind === "conflict") {
      return "The lessons were changed by someone else. The list has been reloaded; try again.";
    }
    return isAppError(e) ? e.message : messageFor("unknown");
  };

  // Lessons move within their own module; the server keeps modules grouped.
  const neighbour = (index: number, delta: -1 | 1): number => {
    const t = index + delta;
    return t >= 0 && t < items.length && items[t]?.moduleId === items[index]?.moduleId ? t : -1;
  };

  const saveList = async (saved: StaffLessonList, announcement: string) => {
    qc.setQueryData(["staff-lessons", courseId], saved);
    await qc.invalidateQueries({ queryKey: ["lessons", courseId] });
    await qc.invalidateQueries({ queryKey: ["course", courseId] });
    AccessibilityInfo.announceForAccessibility(announcement);
  };

  const moveModule = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (busy || target < 0 || target >= modules.length) return;
    const ids = modules.map((m) => m.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved as string);
    setBusy(true);
    setMessage(null);
    try {
      const saved = await staffLessonApi.reorderModules(courseId, ids);
      await saveList(saved, `${modules[index]?.title} moved to ${target + 1} of ${modules.length}`);
    } catch (e) {
      setMessage(explain(e));
      await qc.invalidateQueries({ queryKey: ["staff-lessons", courseId] });
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, delta: -1 | 1) => {
    const target = neighbour(index, delta);
    if (busy || target < 0) return;
    const ids = items.map((l) => l.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved as string);
    setBusy(true);
    setMessage(null);
    try {
      const saved = await staffLessonApi.reorder(courseId, ids);
      qc.setQueryData(["staff-lessons", courseId], saved);
      await qc.invalidateQueries({ queryKey: ["lessons", courseId] });
      AccessibilityInfo.announceForAccessibility(
        `${items[index]?.title} moved to ${target + 1} of ${items.length}`,
      );
    } catch (e) {
      setMessage(explain(e));
      await qc.invalidateQueries({ queryKey: ["staff-lessons", courseId] });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await staffLessonApi.remove(courseId, deleting.id);
    } catch (e) {
      if (isAppError(e) && e.kind === "not_found") {
        // Already gone: the list only needs refreshing.
      } else {
        setDeleting(null);
        setMessage(explain(e));
        return;
      }
    }
    const title = deleting.title;
    setDeleting(null);
    setMessage(null);
    await refresh();
    AccessibilityInfo.announceForAccessibility(`${title} deleted`);
  };

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Lessons
      </Text>
      <Button label="Add lesson" onPress={() => router.push(`/manage/${courseId}/lessons/new`)} />
      {message ? <Banner kind="error" message={message} testID="lessons-error" /> : null}
      {query.status === "success" ? (
        <View style={{ gap: spacing.sm }} testID="staff-module-list">
          <Text variant="subheading" accessibilityRole="header">
            Modules
          </Text>
          {modules.length === 0 ? (
            <Text tone="muted">
              No modules. Modules group lessons into parts; lessons without a module come first.
            </Text>
          ) : null}
          {modules.map((m, i) => (
            <View
              key={m.id}
              style={styles.row}
              testID={`staff-module-${m.id}`}
              ref={(node) => {
                rowRefs.current[`m-${m.id}`] = node;
              }}
              collapsable={false}
            >
              <Text variant="bodyStrong">
                Module {m.position}: {m.title}
              </Text>
              <View style={styles.actions}>
                <Button
                  label="Rename"
                  variant="secondary"
                  accessibilityLabel={`Rename module ${m.title}`}
                  onPress={() => {
                    rowOpener.current = rowRefs.current[`m-${m.id}`];
                    setRenamingModule(m);
                  }}
                />
                <IconButton
                  icon="arrow-up"
                  accessibilityLabel={`Move module ${m.title} up`}
                  disabled={busy || i === 0}
                  onPress={() => void moveModule(i, -1)}
                />
                <IconButton
                  icon="arrow-down"
                  accessibilityLabel={`Move module ${m.title} down`}
                  disabled={busy || i === modules.length - 1}
                  onPress={() => void moveModule(i, 1)}
                />
                <IconButton
                  icon="trash-2"
                  accessibilityLabel={`Delete module ${m.title}`}
                  onPress={() => {
                    rowOpener.current = rowRefs.current[`m-${m.id}`];
                    setDeletingModule(m);
                  }}
                />
              </View>
            </View>
          ))}
          <View ref={addModuleRef} collapsable={false}>
            <Button label="Add module" variant="secondary" onPress={() => setAddingModule(true)} />
          </View>
        </View>
      ) : null}
      {query.status === "pending" ? (
        <StateView state="loading" />
      ) : query.status === "error" ? (
        <StateView
          state={isAppError(query.error) && query.error.kind === "network" ? "offline" : "error"}
          message={isAppError(query.error) ? query.error.message : messageFor("unknown")}
          requestId={isAppError(query.error) ? query.error.requestId : null}
          onAction={() => void query.refetch()}
        />
      ) : items.length === 0 ? (
        <StateView
          state="empty"
          title="No lessons yet"
          message="Add the first lesson. Students see the titles; only free previews show their text."
        />
      ) : (
        <View style={{ gap: spacing.md }} testID="staff-lesson-list">
          {items.map((l, i) => {
            const groupStart =
              modules.length > 0 && (i === 0 || items[i - 1]?.moduleId !== l.moduleId);
            const row = (
              <View
                key={l.id}
                style={styles.row}
                testID={`staff-lesson-${l.id}`}
                ref={(node) => {
                  rowRefs.current[l.id] = node;
                }}
                collapsable={false}
              >
                <View style={{ gap: spacing.xs }}>
                  <Text variant="subheading">
                    {l.position}. {l.title}
                  </Text>
                  <Text variant="caption" tone={l.isPreview ? "link" : "muted"}>
                    {l.isPreview ? "Free preview" : "Locked"}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    accessibilityLabel={`Edit ${l.title}`}
                    onPress={() => router.push(`/manage/${courseId}/lessons/${l.id}`)}
                  />
                  {modules.length > 0 ? (
                    <Button
                      label="Module"
                      variant="secondary"
                      accessibilityLabel={`Change module for ${l.title}, now ${moduleName(l.moduleId)}`}
                      onPress={() => {
                        rowOpener.current = rowRefs.current[l.id];
                        setPicking(l);
                      }}
                    />
                  ) : null}
                  <IconButton
                    icon="arrow-up"
                    accessibilityLabel={`Move ${l.title} up`}
                    disabled={busy || neighbour(i, -1) < 0}
                    onPress={() => void move(i, -1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    accessibilityLabel={`Move ${l.title} down`}
                    disabled={busy || neighbour(i, 1) < 0}
                    onPress={() => void move(i, 1)}
                  />
                  <IconButton
                    icon="trash-2"
                    accessibilityLabel={`Delete ${l.title}`}
                    onPress={() => setDeleting(l)}
                  />
                </View>
              </View>
            );
            return groupStart
              ? [
                  <Text
                    key={`group-${l.id}`}
                    variant="bodyStrong"
                    accessibilityRole="header"
                    testID={`group-${l.moduleId ?? "none"}`}
                  >
                    {moduleName(l.moduleId)}
                  </Text>,
                  row,
                ]
              : row;
          })}
        </View>
      )}
      <Button label="Back" variant="tertiary" onPress={back} />
      <NameSheet
        visible={addingModule}
        title="Add module"
        label="Module title"
        min={1}
        max={MODULE_TITLE_MAX}
        initialName=""
        confirmLabel="Add module"
        openerRef={addModuleRef}
        onClose={() => setAddingModule(false)}
        onSave={async (title) => {
          const saved = await staffLessonApi.addModule(courseId, title);
          setAddingModule(false);
          await saveList(saved, `Module ${title} added`);
        }}
      />
      <NameSheet
        visible={renamingModule !== null}
        title="Rename module"
        label="Module title"
        min={1}
        max={MODULE_TITLE_MAX}
        initialName={renamingModule?.title ?? ""}
        confirmLabel="Save title"
        openerRef={rowOpener}
        onClose={() => setRenamingModule(null)}
        onSave={async (title) => {
          if (!renamingModule) return;
          try {
            const saved = await staffLessonApi.renameModule(
              courseId,
              renamingModule.id,
              renamingModule.version,
              title,
            );
            setRenamingModule(null);
            await saveList(saved, "Module renamed");
          } catch (e) {
            if (isAppError(e) && e.kind === "conflict") {
              setRenamingModule(null);
              setMessage(explain(e));
              await qc.invalidateQueries({ queryKey: ["staff-lessons", courseId] });
              return;
            }
            throw e;
          }
        }}
      />
      <ConfirmDialog
        visible={deletingModule !== null}
        title={`Delete module ${deletingModule?.title ?? ""}?`}
        message="The module is removed. Its lessons stay in the course, without a module."
        confirmLabel="Delete module"
        openerRef={rowOpener}
        onCancel={() => setDeletingModule(null)}
        onConfirm={async () => {
          if (!deletingModule) return;
          const title = deletingModule.title;
          try {
            const saved = await staffLessonApi.removeModule(courseId, deletingModule.id);
            setDeletingModule(null);
            await saveList(saved, `Module ${title} deleted`);
          } catch (e) {
            setDeletingModule(null);
            setMessage(explain(e));
          }
        }}
      />
      <ModulePickerSheet
        visible={picking !== null}
        lessonTitle={picking?.title ?? ""}
        current={picking?.moduleId ?? null}
        modules={modules}
        openerRef={rowOpener}
        onClose={() => setPicking(null)}
        onSave={async (moduleId) => {
          if (!picking) return;
          const saved = await staffLessonApi.moveToModule(courseId, picking.id, moduleId);
          const title = picking.title;
          setPicking(null);
          await saveList(saved, `${title} moved to ${moduleName(moduleId)}`);
        }}
      />
      <ConfirmDialog
        visible={deleting !== null}
        title="Delete this lesson?"
        message={`"${deleting?.title ?? ""}" and its text will be deleted for good. This cannot be undone.`}
        confirmLabel="Delete lesson"
        openerRef={deleteOpener}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
});
