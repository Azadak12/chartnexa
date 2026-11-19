import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { AccessibilityInfo } from "react-native";
import { z } from "zod";
import {
  LIVE_DESCRIPTION_MAX,
  LIVE_DURATION_MAX,
  LIVE_DURATION_MIN,
  LIVE_TITLE_MAX,
  LIVE_TITLE_MIN,
  type StaffLiveSession,
} from "@chartnexa/api-contracts";
import { AppError, isAppError, messageFor } from "../api/errors";
import { canScheduleLive, fetchAccess } from "../courses/course-api";
import { applyServerErrors } from "../forms/form-helpers";
import { FormField } from "../forms/FormField";
import { useZodForm } from "../forms/use-zod-form";
import { StateView } from "../state/StateView";
import { Banner, Button, Screen, Text, useSubmitOnce } from "../ui";
import { fromLocalParts, localParts, staffLiveApi } from "./live-api";

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(LIVE_TITLE_MIN, `Use ${LIVE_TITLE_MIN} to ${LIVE_TITLE_MAX} characters`)
    .max(LIVE_TITLE_MAX, `Use ${LIVE_TITLE_MIN} to ${LIVE_TITLE_MAX} characters`),
  description: z
    .string()
    .trim()
    .max(LIVE_DESCRIPTION_MAX, `Use at most ${LIVE_DESCRIPTION_MAX} characters`),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the form 2026-12-31"),
  time: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}$/, "Use 24-hour time, like 18:30"),
  duration: z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter whole minutes")
    .refine(
      (v) => Number(v) >= LIVE_DURATION_MIN && Number(v) <= LIVE_DURATION_MAX,
      `Use ${LIVE_DURATION_MIN} to ${LIVE_DURATION_MAX} minutes`,
    ),
  joinUrl: z.string().trim().min(1, "Paste the meeting link"),
});
type FormValues = z.output<typeof formSchema>;
const FIELDS = ["title", "description", "date", "time", "duration", "joinUrl"];
/** Server field names that differ from the form's. */
const FIELD_MAP: Record<string, string> = { startsAt: "date", durationMinutes: "duration" };

const timeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "your time zone";
  } catch {
    return "your time zone";
  }
};

/** Full-screen form to schedule a class ("new") or change one. */
export function LiveFormScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const courseId = String(id);
  const creating = sessionId === "new";
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canScheduleLive(access.data, courseId);
  const list = useQuery({
    queryKey: ["live", "staff", courseId],
    queryFn: () => staffLiveApi.list(courseId),
    enabled: allowed && !creating,
  });
  const router = useRouter();
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/manage/${courseId}/live`);

  if (access.status === "pending" || (allowed && !creating && list.status === "pending")) {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  const failed = access.status === "error" ? access.error : list.error;
  if (failed) {
    return (
      <Screen>
        <StateView
          state={isAppError(failed) && failed.kind === "network" ? "offline" : "error"}
          message={isAppError(failed) ? failed.message : messageFor("unknown")}
          onAction={() => {
            void access.refetch();
            if (!creating) void list.refetch();
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
          message="You need permission to schedule live classes for this course."
          actionLabel="Back"
          onAction={back}
        />
      </Screen>
    );
  }
  const existing = creating ? undefined : list.data?.find((s) => s.id === sessionId);
  if (!creating && (!existing || existing.state === "ended" || existing.state === "cancelled")) {
    return (
      <Screen>
        <StateView
          state="empty"
          title={existing ? "This class can no longer change" : "Class not found"}
          message={
            existing
              ? "Ended and cancelled classes stay as they are."
              : "It may have been removed with its course."
          }
          actionLabel="Back to live classes"
          onAction={back}
        />
      </Screen>
    );
  }
  return <Form key={existing?.id ?? "new"} courseId={courseId} existing={existing} onDone={back} />;
}

function Form({
  courseId,
  existing,
  onDone,
}: {
  courseId: string;
  existing: StaffLiveSession | undefined;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const when = existing ? localParts(existing.startsAt) : { date: "", time: "" };
  const { control, handleSubmit, setError } = useZodForm(formSchema, {
    title: existing?.title ?? "",
    description: existing?.description ?? "",
    date: when.date,
    time: when.time,
    duration: existing ? String(existing.durationMinutes) : "60",
    joinUrl: existing?.joinUrl ?? "",
  });
  const [version, setVersion] = useState(existing?.version ?? 1);
  const [message, setMessage] = useState<string | null>(null);
  const started = existing?.state === "live";

  const { run, pending } = useSubmitOnce(async (v: FormValues) => {
    setMessage(null);
    const startsAt = fromLocalParts(v.date, v.time);
    if (!startsAt) {
      setError(
        "date",
        { type: "client", message: "That date or time does not exist" },
        { shouldFocus: true },
      );
      return;
    }
    const body = {
      title: v.title,
      description: v.description,
      startsAt: startsAt.toISOString(),
      durationMinutes: Number(v.duration),
      joinUrl: v.joinUrl,
    };
    try {
      if (existing) {
        // A class that has started keeps its start; sending it unchanged is allowed.
        await staffLiveApi.update(courseId, existing.id, {
          ...body,
          ...(started ? { startsAt: existing.startsAt } : {}),
          expectedVersion: version,
        });
      } else {
        await staffLiveApi.create(courseId, body);
      }
      await qc.invalidateQueries({ queryKey: ["live"] });
      AccessibilityInfo.announceForAccessibility(existing ? "Class saved" : "Class scheduled");
      onDone();
    } catch (e) {
      if (isAppError(e) && e.kind === "conflict") {
        if (e.code === "LIVE_TOO_MANY") {
          setMessage(e.message);
          return;
        }
        if (e.code === "LIVE_ENDED" || e.code === "LIVE_CANCELLED") {
          setMessage(
            e.code === "LIVE_ENDED"
              ? "This class has ended, so it can no longer change."
              : "This class was cancelled, so it can no longer change.",
          );
          return;
        }
        // Someone else saved first: take their version number but keep what was typed.
        try {
          const latest = (await staffLiveApi.list(courseId)).find((s) => s.id === existing?.id);
          if (latest) setVersion(latest.version);
        } catch {
          // The message below still applies; saving again will report any new problem.
        }
        setMessage(
          "Someone else changed this class. Your changes are still here; check them and save again.",
        );
        return;
      }
      if (isAppError(e) && e.kind === "forbidden") {
        void qc.invalidateQueries({ queryKey: ["access"] });
        setMessage("You no longer have permission to do this. What you typed is still here.");
        return;
      }
      const mapped =
        e instanceof AppError
          ? new AppError(
              e.kind,
              e.message,
              e.status,
              e.requestId,
              e.fields.map((f) => ({ ...f, field: FIELD_MAP[f.field] ?? f.field })),
              e.retryAfterSeconds,
              e.code,
            )
          : e;
      if (!applyServerErrors(mapped, setError, FIELDS)) {
        setMessage(isAppError(e) ? e.message : messageFor("unknown"));
      }
    }
  });

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {existing ? "Edit live class" : "Schedule a live class"}
      </Text>
      {message ? <Banner kind="error" message={message} testID="live-form-error" /> : null}
      <FormField control={control} name="title" label="Title" maxLength={LIVE_TITLE_MAX + 10} />
      <FormField
        control={control}
        name="description"
        label="What to expect (optional)"
        multiline
        maxLength={LIVE_DESCRIPTION_MAX + 10}
      />
      <Text tone="muted">Times are in {timeZone()}.</Text>
      <FormField
        control={control}
        name="date"
        label="Date (year-month-day)"
        placeholder="2026-12-31"
        editable={!started}
        autoCorrect={false}
      />
      <FormField
        control={control}
        name="time"
        label="Start time (24-hour)"
        placeholder="18:30"
        editable={!started}
        autoCorrect={false}
      />
      {started ? (
        <Text variant="caption" tone="muted">
          This class has started, so its start time cannot change.
        </Text>
      ) : null}
      <FormField
        control={control}
        name="duration"
        label="Length in minutes"
        keyboardType="number-pad"
      />
      <FormField
        control={control}
        name="joinUrl"
        label="Meeting link (https://)"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text variant="caption" tone="muted">
        Students get this link only from 15 minutes before the start until the class ends.
      </Text>
      <Button
        label={existing ? "Save class" : "Schedule class"}
        loading={pending}
        onPress={() => void handleSubmit(run)()}
      />
      <Button label="Back" variant="tertiary" onPress={onDone} />
    </Screen>
  );
}
