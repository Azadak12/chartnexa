import * as DocumentPicker from "expo-document-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { z } from "zod";
import {
  ASSIGNMENT_ATTACHMENT_MAX_BYTES,
  ASSIGNMENT_INSTRUCTIONS_MAX,
  ASSIGNMENT_TITLE_MAX,
  ASSIGNMENT_TITLE_MIN,
  RESOURCE_MIME_TYPES,
  type StaffAssignment,
} from "@chartnexa/api-contracts";
import { AppError, isAppError, messageFor } from "../api/errors";
import { canManageAssignments, fetchAccess } from "../courses/course-api";
import { applyServerErrors } from "../forms/form-helpers";
import { FormField } from "../forms/FormField";
import { useZodForm } from "../forms/use-zod-form";
import { staffLessonApi } from "../lessons/lesson-api";
import { fromLocalParts, localParts } from "../live/live-api";
import { describeFile, fileReader } from "../resources/upload";
import { StateView } from "../state/StateView";
import { spacing } from "../theme";
import { Banner, Button, Chip, Screen, Text, useSubmitOnce } from "../ui";
import { staffAssignmentApi } from "./assignment-api";
import { StaffPageHeader } from "../kit/StaffPageHeader";

export const attachmentPicker = {
  async pick(): Promise<{ uri: string; name: string; size?: number; mimeType?: string } | null> {
    const res = await DocumentPicker.getDocumentAsync({
      type: [...RESOURCE_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets[0]) return null;
    const a = res.assets[0];
    return {
      uri: a.uri,
      name: a.name,
      ...(a.size ? { size: a.size } : {}),
      ...(a.mimeType ? { mimeType: a.mimeType } : {}),
    };
  },
};

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(ASSIGNMENT_TITLE_MIN, `Use ${ASSIGNMENT_TITLE_MIN} to ${ASSIGNMENT_TITLE_MAX} characters`)
    .max(ASSIGNMENT_TITLE_MAX, `Use ${ASSIGNMENT_TITLE_MIN} to ${ASSIGNMENT_TITLE_MAX} characters`),
  instructions: z
    .string()
    .trim()
    .min(1, "Write the instructions")
    .max(ASSIGNMENT_INSTRUCTIONS_MAX, `Use at most ${ASSIGNMENT_INSTRUCTIONS_MAX} characters`),
  date: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use the form 2026-12-31, or leave empty"),
  time: z
    .string()
    .trim()
    .regex(/^(\d{1,2}:\d{2})?$/, "Use 24-hour time, like 18:30"),
});
type Values = z.output<typeof formSchema>;

/** Create or change an assignment, with its due date, lesson and one attachment. */
export function AssignmentFormScreen() {
  const { id, assignmentId } = useLocalSearchParams<{ id: string; assignmentId?: string }>();
  const courseId = String(id);
  const editingId = assignmentId && assignmentId !== "new" ? assignmentId : undefined;
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canManageAssignments(access.data, courseId);
  const existing = useQuery({
    queryKey: ["staff-assignment", courseId, editingId],
    queryFn: () => staffAssignmentApi.get(courseId, editingId as string),
    enabled: allowed && !!editingId,
    staleTime: 0,
  });
  const router = useRouter();
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/manage/${courseId}/assignments`);
  if (access.status === "pending" || (allowed && editingId && existing.status === "pending")) {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  const failed = access.status === "error" ? access.error : existing.error;
  if (failed) {
    return (
      <Screen>
        <StateView
          state={isAppError(failed) && failed.kind === "network" ? "offline" : "error"}
          message={isAppError(failed) ? failed.message : messageFor("unknown")}
          onAction={() => {
            void access.refetch();
            if (editingId) void existing.refetch();
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
          message="You need permission to manage assignments for this course."
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
      existing={existing.data}
      onDone={back}
    />
  );
}

function Form({
  courseId,
  existing,
  onDone,
}: {
  courseId: string;
  existing: StaffAssignment | undefined;
  onDone: (a?: StaffAssignment) => void;
}) {
  const qc = useQueryClient();
  const when = existing?.dueAt ? localParts(existing.dueAt) : { date: "", time: "" };
  const { control, handleSubmit, setError } = useZodForm(formSchema, {
    title: existing?.title ?? "",
    instructions: existing?.instructions ?? "",
    date: when.date,
    time: when.time,
  });
  const lessons = useQuery({
    queryKey: ["staff-lessons", courseId],
    queryFn: () => staffLessonApi.list(courseId),
  });
  const [lessonId, setLessonId] = useState<string | null>(existing?.lessonId ?? null);
  const [current, setCurrent] = useState<StaffAssignment | undefined>(existing);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);

  const save = useSubmitOnce(async (v: Values, publish: boolean) => {
    setMessage(null);
    let dueAt: string | null = null;
    if (v.date || v.time) {
      const d = fromLocalParts(v.date, v.time);
      if (!d) {
        setError(
          "date",
          { type: "client", message: "Give both a real date and a time" },
          { shouldFocus: true },
        );
        return;
      }
      dueAt = d.toISOString();
    }
    try {
      let saved: StaffAssignment;
      if (current) {
        saved = await staffAssignmentApi.update(courseId, current.id, {
          expectedVersion: current.version,
          title: v.title,
          instructions: v.instructions,
          lessonId,
          dueAt,
          ...(publish && current.status === "draft" ? { status: "published" as const } : {}),
        });
      } else {
        saved = await staffAssignmentApi.create(courseId, {
          title: v.title,
          instructions: v.instructions,
          lessonId,
          dueAt,
          status: publish ? "published" : "draft",
        });
      }
      setCurrent(saved);
      await qc.invalidateQueries({ queryKey: ["staff-assignments", courseId] });
      await qc.invalidateQueries({ queryKey: ["staff-assignment", courseId, saved.id] });
      const first = !current;
      const text = publish
        ? "Published. You can now assign it."
        : first
          ? "Saved as a draft. You can add an attachment now."
          : "Saved.";
      AccessibilityInfo.announceForAccessibility(text);
      if (first && !publish) {
        // Stay, so an attachment can be added to the new draft.
        setMessage({ ok: true, text });
        return;
      }
      onDone(saved);
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict") {
        setMessage({ ok: false, text: e.message });
        if (current) {
          try {
            setCurrent(await staffAssignmentApi.get(courseId, current.id));
          } catch {
            // The message above stands.
          }
        }
        return;
      }
      const mapped =
        e instanceof AppError
          ? new AppError(
              e.kind,
              e.message,
              e.status,
              e.requestId,
              e.fields.map((f) => ({ ...f, field: f.field === "dueAt" ? "date" : f.field })),
              e.retryAfterSeconds,
              e.code,
            )
          : e;
      if (!applyServerErrors(mapped, setError, ["title", "instructions", "date"])) {
        setMessage({ ok: false, text: isAppError(e) ? e.message : messageFor("unknown") });
      }
    }
  });

  const attach = async () => {
    if (!current || fileBusy) return;
    setMessage(null);
    const p = await attachmentPicker.pick();
    if (!p) return;
    if (p.size !== undefined && p.size > ASSIGNMENT_ATTACHMENT_MAX_BYTES) {
      setMessage({ ok: false, text: "Attachments can be up to 4 MB." });
      return;
    }
    setFileBusy(true);
    try {
      const bytes = await fileReader.readPart(p.uri, 0, p.size ?? ASSIGNMENT_ATTACHMENT_MAX_BYTES);
      const next = await staffAssignmentApi.setAttachment(courseId, current.id, p.name, bytes);
      setCurrent(next);
      setMessage({ ok: true, text: "Attachment saved." });
    } catch (e) {
      setMessage({ ok: false, text: isAppError(e) ? e.message : messageFor("unknown") });
    } finally {
      setFileBusy(false);
    }
  };
  const detach = async () => {
    if (!current || fileBusy) return;
    setFileBusy(true);
    try {
      setCurrent(await staffAssignmentApi.removeAttachment(courseId, current.id));
      setMessage({ ok: true, text: "Attachment removed." });
    } catch (e) {
      setMessage({ ok: false, text: isAppError(e) ? e.message : messageFor("unknown") });
    } finally {
      setFileBusy(false);
    }
  };

  const items = lessons.data?.items ?? [];
  return (
    <Screen>
      <StaffPageHeader
        title={existing ? "Edit assignment" : "New assignment"}
        eyebrow="COURSE STUDIO"
        icon="edit-3"
      />
      {message ? (
        <Banner
          kind={message.ok ? "success" : "error"}
          message={message.text}
          testID="assignment-form-msg"
        />
      ) : null}
      <FormField
        control={control}
        name="title"
        label="Title"
        maxLength={ASSIGNMENT_TITLE_MAX + 10}
      />
      <FormField
        control={control}
        name="instructions"
        label="Instructions"
        multiline
        numberOfLines={6}
        maxLength={ASSIGNMENT_INSTRUCTIONS_MAX + 50}
      />
      <Text variant="subheading">Due date (optional)</Text>
      <Text variant="caption" tone="muted">
        In your time zone. Leave both empty for no due date.
      </Text>
      <FormField
        control={control}
        name="date"
        label="Date (year-month-day)"
        placeholder="2026-12-31"
        autoCorrect={false}
      />
      <FormField
        control={control}
        name="time"
        label="Time (24-hour)"
        placeholder="18:30"
        autoCorrect={false}
      />
      <Text variant="subheading">Related lesson (optional)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip label="None" selected={lessonId === null} onPress={() => setLessonId(null)} />
        {items.map((l) => (
          <Chip
            key={l.id}
            label={l.title}
            selected={lessonId === l.id}
            onPress={() => setLessonId(l.id)}
          />
        ))}
      </View>
      <Text variant="subheading">Attachment (optional)</Text>
      {current ? (
        <>
          {current.attachment ? (
            <Text>
              {current.attachment.name} ·{" "}
              {describeFile(current.attachment.mimeType, current.attachment.sizeBytes)}
            </Text>
          ) : (
            <Text tone="muted">PDF, image, Word or text file, up to 4 MB.</Text>
          )}
          <Button
            label={current.attachment ? "Replace attachment" : "Add attachment"}
            variant="secondary"
            loading={fileBusy}
            onPress={() => void attach()}
          />
          {current.attachment ? (
            <Button
              label="Remove attachment"
              variant="tertiary"
              disabled={fileBusy}
              onPress={() => void detach()}
            />
          ) : null}
        </>
      ) : (
        <Text tone="muted">Save the assignment first, then add an attachment.</Text>
      )}
      <Button
        label={current ? "Save changes" : "Save as draft"}
        loading={save.pending}
        variant={current?.status === "draft" || !current ? "secondary" : "primary"}
        onPress={() => void handleSubmit((v) => save.run(v as Values, false))()}
      />
      {!current || current.status === "draft" ? (
        <Button
          label="Save and publish"
          loading={save.pending}
          onPress={() => void handleSubmit((v) => save.run(v as Values, true))()}
        />
      ) : null}
      <Button label="Back" variant="tertiary" onPress={() => onDone()} />
    </Screen>
  );
}
