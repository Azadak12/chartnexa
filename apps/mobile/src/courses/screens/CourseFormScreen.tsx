import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import {
  COURSE_LEVELS,
  COURSE_TONES,
  DESCRIPTION_MAX,
  TITLE_MAX,
  TITLE_MIN,
  type CourseLevel,
  type CourseTone,
  type StaffCourse,
} from "@chartnexa/api-contracts";
import { AppError, isAppError, messageFor } from "../../api/errors";
import { applyServerErrors } from "../../forms/form-helpers";
import { FormField } from "../../forms/FormField";
import { useZodForm } from "../../forms/use-zod-form";
import { StateView } from "../../state/StateView";
import { spacing } from "../../theme";
import { Banner, Button, Chip, Screen, Text, useSubmitOnce } from "../../ui";
import { ConfirmDialog } from "../../auth/ConfirmDialog";
import {
  canCreateCourses,
  canAuthorLessons,
  canManageCourses,
  canPublishCourse,
  fetchAccess,
  staffCourseApi,
} from "../course-api";
import { LEVEL_LABEL } from "../CourseCard";
import { centsToDollarText, parseDollars } from "../money";

export const TONE_LABEL: Record<CourseTone, string> = {
  blue: "Blue",
  black: "Black",
  tint: "Light",
};

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(TITLE_MIN, `Use at least ${TITLE_MIN} characters`)
    .max(TITLE_MAX, `Use at most ${TITLE_MAX} characters`),
  description: z.string().trim().max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters`),
  priceText: z.string().superRefine((v, ctx) => {
    const r = parseDollars(v);
    if (!r.ok) ctx.addIssue({ code: "custom", message: r.message });
  }),
});

const NO_ACCESS_MESSAGE =
  "You no longer have access to this course. What you typed is still here; go back to leave.";

/** Server field names to the form's field names. */
const FIELD_MAP: Record<string, string> = { priceCents: "priceText" };

/** A copy of the error whose field names match the form (AppError must stay an AppError). */
function withFormFields(e: AppError): AppError {
  return new AppError(
    e.kind,
    e.message,
    e.status,
    e.requestId,
    e.fields.map((f) => ({ ...f, field: FIELD_MAP[f.field] ?? f.field })),
    e.retryAfterSeconds,
  );
}

/** Create (no id) or edit (with id) a course. Edits carry the version they started from. */
export function CourseFormScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id !== undefined && id !== "new";

  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const existing = useQuery({
    queryKey: ["staff-course", id],
    enabled: editing,
    queryFn: () => staffCourseApi.get(String(id)),
  });

  if (access.status === "pending" || (editing && existing.status === "pending")) {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error" || (editing && existing.status === "error")) {
    const e = access.error ?? existing.error;
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
  if (!canManageCourses(access.data) || (!editing && !canCreateCourses(access.data))) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message={
            editing ? "Only staff can manage courses." : "You need permission to create courses."
          }
          actionLabel="Back"
          onAction={() => router.replace("/home")}
        />
      </Screen>
    );
  }
  return (
    <Form
      key={existing.data?.id ?? "new"}
      course={editing ? existing.data : undefined}
      canPublish={editing && canPublishCourse(access.data, String(id))}
      canLessons={editing && canAuthorLessons(access.data, String(id))}
      onSaved={() => qc.invalidateQueries({ queryKey: ["staff-courses"] })}
    />
  );
}

function Form({
  course,
  canPublish,
  canLessons,
  onSaved,
}: {
  course: StaffCourse | undefined;
  canPublish: boolean;
  canLessons: boolean;
  onSaved: () => unknown;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { control, handleSubmit, setError, reset, formState } = useZodForm(formSchema, {
    title: course?.title ?? "",
    description: course?.description ?? "",
    priceText: course ? centsToDollarText(course.priceCents) : "",
  });
  const [level, setLevel] = useState<CourseLevel>(course?.level ?? "beginner");
  const [tone, setTone] = useState<CourseTone>(course?.coverTone ?? "blue");
  const [version, setVersion] = useState(course?.version ?? 1);
  const [status, setStatus] = useState<StaffCourse["status"] | null>(course?.status ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | null>(null);
  const publishRef = useRef(null);
  const initial = useRef({ level: course?.level ?? "beginner", tone: course?.coverTone ?? "blue" });
  const dirty =
    formState.isDirty || level !== initial.current.level || tone !== initial.current.tone;

  useEffect(() => {
    if (!course) return;
    setVersion(course.version);
    setStatus(course.status);
  }, [course]);

  const refreshLists = async () => {
    await onSaved();
    await qc.invalidateQueries({ queryKey: ["catalog"] });
    if (course) await qc.invalidateQueries({ queryKey: ["staff-course", course.id] });
  };

  const { run, pending } = useSubmitOnce(async (v: z.output<typeof formSchema>) => {
    setMessage(null);
    setStale(false);
    setInfo(null);
    const price = parseDollars(v.priceText);
    if (!price.ok) return;
    const body = {
      title: v.title,
      description: v.description,
      level,
      priceCents: price.cents,
      coverTone: tone,
    };
    try {
      if (course) {
        const saved = await staffCourseApi.update(course.id, { ...body, expectedVersion: version });
        setVersion(saved.version);
        reset({
          title: saved.title,
          description: saved.description,
          priceText: centsToDollarText(saved.priceCents),
        });
        initial.current = { level: saved.level, tone: saved.coverTone };
        setInfo("Saved.");
        await refreshLists();
      } else {
        await staffCourseApi.create(body);
        await refreshLists();
        router.replace("/manage");
      }
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict" && course) {
        setStale(true);
        return;
      }
      if (isAppError(e) && e.kind === "forbidden") {
        setMessage(NO_ACCESS_MESSAGE);
        void qc.invalidateQueries({ queryKey: ["access"] });
        return;
      }
      const mapped = isAppError(e) ? withFormFields(e) : e;
      if (!applyServerErrors(mapped, setError, ["title", "description", "priceText"]))
        setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

  /** Loads the newest version number but keeps what the person typed. */
  const loadLatest = async () => {
    if (!course) return;
    try {
      const latest = await staffCourseApi.get(course.id);
      setVersion(latest.version);
      setStatus(latest.status);
      setStale(false);
      setInfo(
        `Loaded the latest version (${latest.version}). Your typed changes are still here; review them and save again.`,
      );
    } catch (e) {
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  };

  const transition = async (kind: "publish" | "unpublish") => {
    if (!course) return;
    try {
      const saved =
        kind === "publish"
          ? await staffCourseApi.publish(course.id)
          : await staffCourseApi.unpublish(course.id);
      setStatus(saved.status);
      setVersion(saved.version);
      setConfirm(null);
      setInfo(
        kind === "publish"
          ? "Published. Students can now see this course."
          : "Unpublished. Students can no longer see this course.",
      );
      await refreshLists();
    } catch (e) {
      if (isAppError(e) && e.fields.length > 0) {
        applyServerErrors(withFormFields(e), setError, ["title", "description", "priceText"]);
        setConfirm(null);
        setMessage("Fix the highlighted fields, save, then publish.");
        return;
      }
      if (isAppError(e) && e.kind === "forbidden") {
        setConfirm(null);
        setMessage(NO_ACCESS_MESSAGE);
        void qc.invalidateQueries({ queryKey: ["access"] });
        return;
      }
      throw e;
    }
  };

  return (
    <Screen keyboard>
      <Text variant="title" accessibilityRole="header">
        {course ? "Edit course" : "New course"}
      </Text>
      {course && status ? (
        <Text
          variant="bodyStrong"
          tone={status === "published" ? "success" : "muted"}
          testID="course-status"
        >
          Status: {status === "draft" ? "Draft" : "Published"}
        </Text>
      ) : null}
      {message ? <Banner kind="error" message={message} testID="form-error" /> : null}
      {info ? <Banner kind="success" message={info} testID="form-info" /> : null}
      {stale ? (
        <>
          <Banner
            kind="warning"
            message="This course was changed by someone else since you opened it."
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
        name="description"
        label="Description"
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />
      <View style={{ gap: spacing.sm }}>
        <Text variant="bodyStrong">Level</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {COURSE_LEVELS.map((l) => (
            <Chip
              key={l}
              label={LEVEL_LABEL[l]}
              selected={level === l}
              onPress={() => setLevel(l)}
            />
          ))}
        </View>
      </View>
      <FormField
        control={control}
        name="priceText"
        label="Price in US dollars (0 for free)"
        keyboardType="decimal-pad"
      />
      <View style={{ gap: spacing.sm }}>
        <Text variant="bodyStrong">Cover</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {COURSE_TONES.map((t) => (
            <Chip key={t} label={TONE_LABEL[t]} selected={tone === t} onPress={() => setTone(t)} />
          ))}
        </View>
      </View>
      <Button
        label={course ? "Save changes" : "Create draft"}
        loading={pending}
        onPress={() => void handleSubmit((v) => run(v))()}
      />
      {course && status && canPublish ? (
        <View ref={publishRef} collapsable={false} style={{ gap: spacing.sm }}>
          {dirty ? (
            <Text variant="caption" tone="muted">
              Save your changes before publishing or unpublishing.
            </Text>
          ) : null}
          <Button
            label={status === "draft" ? "Publish course" : "Unpublish course"}
            variant="secondary"
            disabled={dirty}
            onPress={() => setConfirm(status === "draft" ? "publish" : "unpublish")}
          />
        </View>
      ) : null}
      {course && canLessons ? (
        <Button
          label="Lessons"
          variant="secondary"
          onPress={() => router.push(`/manage/${course.id}/lessons`)}
        />
      ) : null}
      <Button label="Back" variant="tertiary" onPress={() => router.back()} />
      <ConfirmDialog
        visible={confirm !== null}
        title={confirm === "publish" ? "Publish this course?" : "Unpublish this course?"}
        message={
          confirm === "publish"
            ? "Students will be able to see and open this course in the catalog right away."
            : "Students will no longer see this course. It goes back to a draft."
        }
        confirmLabel={confirm === "publish" ? "Publish" : "Unpublish"}
        openerRef={publishRef}
        onCancel={() => setConfirm(null)}
        onConfirm={() => transition(confirm ?? "publish")}
      />
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
