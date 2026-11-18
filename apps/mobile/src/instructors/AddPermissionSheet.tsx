import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState, type RefObject } from "react";
import { ScrollView, View } from "react-native";
import {
  GRANTABLE_PERMISSIONS,
  REASON_MAX,
  REASON_MIN,
  type GrantablePermission,
  type InstructorPermissionsResponse,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { staffCourseApi } from "../courses/course-api";
import { spacing } from "../theme";
import { BottomSheet, Banner, Button, Chip, Text, TextField, useSubmitOnce } from "../ui";
import { instructorApi } from "./instructor-api";
import { labelFor } from "./labels";

export interface AddPermissionSheetProps {
  visible: boolean;
  instructorId: string;
  grantable: InstructorPermissionsResponse["grantable"];
  onDone: () => void;
  onCancel: () => void;
  openerRef?: RefObject<unknown>;
}

/** Pick one permission, the course it applies to (when it needs one), and a reason. */
export function AddPermissionSheet({
  visible,
  instructorId,
  grantable,
  onDone,
  onCancel,
  openerRef,
}: AddPermissionSheetProps) {
  const [permission, setPermission] = useState<GrantablePermission | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ permission?: string; course?: string; reason?: string }>(
    {},
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (visible) return;
    setPermission(null);
    setCourseId(null);
    setFilter("");
    setReason("");
    setErrors({});
    setMessage(null);
  }, [visible]);

  const needsCourse = permission !== null && GRANTABLE_PERMISSIONS[permission] === "course";
  const courses = useInfiniteQuery({
    queryKey: ["grant-course-picker"],
    enabled: visible && needsCourse,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => staffCourseApi.list(pageParam ? { cursor: pageParam } : {}),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = (courses.data?.pages.flatMap((p) => p.items) ?? []).filter((c) =>
    c.title.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const someBlocked = grantable.some((g) => !g.allowedForYou);

  const { run, pending } = useSubmitOnce(async () => {
    const next: typeof errors = {};
    const trimmed = reason.trim();
    if (!permission) next.permission = "Choose a permission";
    if (needsCourse && !courseId) next.course = "Choose a course";
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      next.reason = `Write ${REASON_MIN} to ${REASON_MAX} characters`;
    }
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length > 0 || !permission) return;
    try {
      await instructorApi.grant(instructorId, {
        permission,
        ...(needsCourse && courseId ? { courseId } : {}),
        reason: trimmed,
      });
      onDone();
    } catch (e) {
      if (isAppError(e) && e.fields.length > 0) {
        const mapped: typeof errors = {};
        for (const f of e.fields) {
          if (f.field === "reason") mapped.reason = f.message;
          else if (f.field === "courseId") mapped.course = f.message;
          else if (f.field === "permission") mapped.permission = f.message;
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          return;
        }
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

  return (
    <BottomSheet
      visible={visible}
      title="Add permission"
      onDismiss={onCancel}
      {...(openerRef ? { openerRef } : {})}
    >
      <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.md }}>
          {message ? <Banner kind="error" message={message} testID="add-error" /> : null}
          <Text variant="bodyStrong">What can they do?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {grantable.map((g) => (
              <Chip
                key={g.permission}
                label={labelFor(g.permission)}
                selected={permission === g.permission}
                disabled={!g.allowedForYou}
                onPress={() => {
                  setPermission(g.permission);
                  setCourseId(null);
                  setErrors((e) => ({ ...e, permission: undefined, course: undefined }));
                }}
              />
            ))}
          </View>
          {someBlocked ? (
            <Text variant="caption" tone="muted" testID="ceiling-note">
              Dimmed permissions can only be given by an Admin.
            </Text>
          ) : null}
          {errors.permission ? (
            <Text variant="caption" tone="error">
              {errors.permission}
            </Text>
          ) : null}
          {needsCourse ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyStrong">Which course?</Text>
              <TextField label="Find a course" value={filter} onChangeText={setFilter} />
              {courses.status === "pending" ? <Text tone="muted">Loading courses…</Text> : null}
              {courses.status === "error" ? (
                <Button
                  label="Could not load courses. Retry"
                  variant="secondary"
                  onPress={() => void courses.refetch()}
                />
              ) : null}
              {courses.status === "success" && items.length === 0 ? (
                <Text tone="muted">No courses match.</Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {items.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.title}
                    selected={courseId === c.id}
                    onPress={() => {
                      setCourseId(c.id);
                      setErrors((e) => ({ ...e, course: undefined }));
                    }}
                  />
                ))}
              </View>
              {courses.hasNextPage ? (
                <Button
                  label="Show more courses"
                  variant="tertiary"
                  loading={courses.isFetchingNextPage}
                  onPress={() => void courses.fetchNextPage()}
                />
              ) : null}
              {errors.course ? (
                <Text variant="caption" tone="error">
                  {errors.course}
                </Text>
              ) : null}
            </View>
          ) : null}
          <TextField
            label="Reason"
            value={reason}
            onChangeText={setReason}
            error={errors.reason}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={REASON_MAX + 50}
          />
          <Button label="Add permission" loading={pending} onPress={() => void run()} />
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
