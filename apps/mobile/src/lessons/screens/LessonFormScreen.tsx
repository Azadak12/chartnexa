import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Switch, View } from "react-native";
import { z } from "zod";
import {
  LESSON_BODY_MAX,
  LESSON_ERROR_CODES,
  LESSON_TITLE_MAX,
  type StaffLesson,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { canAuthorLessons, fetchAccess } from "../../courses/course-api";
import { applyServerErrors } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { StateView } from "../../state/StateView";
import { colors, spacing } from "../../theme";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../../ui";
import { staffLessonApi } from "../lesson-api";

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Add a title")
    .max(LESSON_TITLE_MAX, `Use at most ${LESSON_TITLE_MAX} characters`),
  body: z.string().max(LESSON_BODY_MAX, `Use at most ${LESSON_BODY_MAX} characters`),
});

const NO_ACCESS_MESSAGE =
  "You no longer have access to this course's lessons. What you typed is still here; go back to leave.";

/** A random key per new lesson, kept across retries so a lost response cannot create two. */
const newKey = () =>
  `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;

/** Add (lessonId "new") or edit one lesson, full screen. Edits carry the version they started from. */
export function LessonFormScreen() {
  const router = useRouter();
  const { id, lessonId } = useLocalSearchParams<{ id: string; lessonId: string }>();
  const courseId = String(id);
  const editing = lessonId !== "new";
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/manage/${courseId}/lessons`);

  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canAuthorLessons(access.data, courseId);
  const existing = useQuery({
    queryKey: ["staff-lesson", courseId, lessonId],
    enabled: editing && allowed,
    queryFn: () => staffLessonApi.get(courseId, String(lessonId)),
  });

  if (access.status === "pending" || (editing && allowed && existing.status === "pending")) {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error" || (editing && allowed && existing.status === "error")) {
    const e = access.error ?? existing.error;
    if (isAppError(e) && e.kind === "not_found") {
      return (
        <Screen>
          <StateView
            state="empty"
            title="Lesson not found"
            message="It may have been deleted."
            actionLabel="Back"
            onAction={back}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <StateView
          state="error"
          message={isAppError(e) ? e.message : messageFor("unknown")}
          onAction={() => {
            void access.refetch();
            if (editing) void existing.refetch();
          }}
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
  return (
    <Form
      key={existing.data?.id ?? "new"}
      courseId={courseId}
      lesson={editing ? existing.data : undefined}
      back={back}
    />
  );
}

function Form({
  courseId,
  lesson,
  back,
}: {
  courseId: string;
  lesson: StaffLesson | undefined;
  back: () => void;
}) {
  const qc = useQueryClient();
  const { control, handleSubmit, setError, reset } = useZodForm(formSchema, {
    title: lesson?.title ?? "",
    body: lesson?.body ?? "",
  });
  const [preview, setPreview] = useState(lesson?.isPreview ?? false);
  const [version, setVersion] = useState(lesson?.version ?? 1);
  const [created, setCreated] = useState<StaffLesson | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const idempotencyKey = useRef(newKey());
  // After the first successful add, further saves edit that new lesson.
  const current = lesson ?? created;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["staff-lessons", courseId] });
    await qc.invalidateQueries({ queryKey: ["lessons", courseId] });
    await qc.invalidateQueries({ queryKey: ["course", courseId] });
    if (current) {
      await qc.invalidateQueries({ queryKey: ["staff-lesson", courseId, current.id] });
      await qc.invalidateQueries({ queryKey: ["lesson", courseId, current.id] });
    }
  };

  const { run, pending } = useSubmitOnce(async (v: z.output<typeof formSchema>) => {
    setMessage(null);
    setStale(false);
    setInfo(null);
    try {
      if (current) {
        const saved = await staffLessonApi.update(courseId, current.id, {
          expectedVersion: version,
          title: v.title,
          body: v.body,
          isPreview: preview,
        });
        setVersion(saved.version);
        reset({ title: saved.title, body: saved.body });
        setInfo("Saved.");
        await refresh();
      } else {
        const saved = await staffLessonApi.create(courseId, {
          title: v.title,
          body: v.body,
          isPreview: preview,
          idempotencyKey: idempotencyKey.current,
        });
        await refresh();
        setCreated(saved);
        setVersion(saved.version);
        back();
      }
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict") {
        if (e.code === LESSON_ERROR_CODES.limitReached) {
          setMessage("This course already has the maximum number of lessons (200).");
        } else {
          setStale(true);
        }
        return;
      }
      if (isAppError(e) && e.kind === "forbidden") {
        setMessage(NO_ACCESS_MESSAGE);
        void qc.invalidateQueries({ queryKey: ["access"] });
        return;
      }
      if (isAppError(e) && e.kind === "not_found" && current) {
        setMessage("This lesson was deleted. What you typed is still here; go back to leave.");
        return;
      }
      if (!applyServerErrors(e, setError, ["title", "body"]))
        setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

  /** Loads the newest version number but keeps what the person typed. */
  const loadLatest = async () => {
    if (!current) return;
    try {
      const latest = await staffLessonApi.get(courseId, current.id);
      setVersion(latest.version);
      setStale(false);
      setInfo(
        "Loaded the latest version. Your typed changes are still here; review them and save again.",
      );
    } catch (e) {
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  };

  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        {current ? "Edit lesson" : "New lesson"}
      </Text>
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      {info ? <Banner kind="success" message={info} testID="form-info" /> : null}
      {stale ? (
        <>
          <Banner
            kind="warning"
            message="This lesson was changed by someone else since you opened it."
            testID="stale-notice"
          />
          <Button
            label="Use latest version"
            variant="secondary"
            onPress={() => void loadLatest()}
          />
        </>
      ) : null}
      <FormField control={control} name="title" label="Title" />
      <FormField
        control={control}
        name="body"
        label="Lesson text"
        multiline
        numberOfLines={10}
        textAlignVertical="top"
      />
      <Text variant="caption" tone="muted" testID="lesson-text-hint">
        Leave a blank line between paragraphs. Students read one paragraph at a time.
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="bodyStrong">Free preview</Text>
          <Text variant="caption" tone="muted">
            Anyone can read a free preview, even without enrolling.
          </Text>
        </View>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel="Free preview"
          accessibilityState={{ checked: preview }}
          value={preview}
          onValueChange={setPreview}
          trackColor={{ true: colors.blue }}
        />
      </View>
      <Button
        label={current ? "Save changes" : "Add lesson"}
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v))()}
      />
      <Button label="Back" variant="tertiary" onPress={back} />
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
