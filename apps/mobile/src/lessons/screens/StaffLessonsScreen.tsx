import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import type { StaffLesson } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { ConfirmDialog } from "../../auth/ConfirmDialog";
import { canAuthorLessons, fetchAccess } from "../../courses/course-api";
import { StateView } from "../../state/StateView";
import { colors, neutrals, radii, spacing } from "../../theme";
import { Banner, Button, IconButton, Screen, Text } from "../../ui";
import { staffLessonApi } from "../lesson-api";

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

  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canAuthorLessons(access.data, courseId);
  const query = useQuery({
    queryKey: ["staff-lessons", courseId],
    enabled: allowed,
    queryFn: () => staffLessonApi.list(courseId),
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));
  const items = query.data?.items ?? [];

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

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (busy || target < 0 || target >= items.length) return;
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
          {items.map((l, i) => (
            <View key={l.id} style={styles.row} testID={`staff-lesson-${l.id}`}>
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
                <IconButton
                  icon="arrow-up"
                  accessibilityLabel={`Move ${l.title} up`}
                  disabled={busy || i === 0}
                  onPress={() => void move(i, -1)}
                />
                <IconButton
                  icon="arrow-down"
                  accessibilityLabel={`Move ${l.title} down`}
                  disabled={busy || i === items.length - 1}
                  onPress={() => void move(i, 1)}
                />
                <IconButton
                  icon="trash-2"
                  accessibilityLabel={`Delete ${l.title}`}
                  onPress={() => setDeleting(l)}
                />
              </View>
            </View>
          ))}
        </View>
      )}
      <Button label="Back" variant="tertiary" onPress={back} />
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
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
});
