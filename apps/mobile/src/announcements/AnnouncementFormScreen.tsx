import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { z } from "zod";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_TITLE_MIN,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canPublishAnnouncements, fetchAccess, staffCourseApi } from "../courses/course-api";
import { applyServerErrors } from "../forms/form-helpers";
import { FormField } from "../forms/FormField";
import { useZodForm } from "../forms/use-zod-form";
import { StateView } from "../state/StateView";
import { spacing } from "../theme";
import { Banner, Button, Chip, Screen, Text, useSubmitOnce } from "../ui";
import { newAnnouncementKey, staffAnnouncementApi } from "./announcement-api";
import { StaffPageHeader } from "../kit/StaffPageHeader";

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(
      ANNOUNCEMENT_TITLE_MIN,
      `Use ${ANNOUNCEMENT_TITLE_MIN} to ${ANNOUNCEMENT_TITLE_MAX} characters`,
    )
    .max(
      ANNOUNCEMENT_TITLE_MAX,
      `Use ${ANNOUNCEMENT_TITLE_MIN} to ${ANNOUNCEMENT_TITLE_MAX} characters`,
    ),
  body: z
    .string()
    .trim()
    .min(1, "Write the announcement")
    .max(ANNOUNCEMENT_BODY_MAX, `Use at most ${ANNOUNCEMENT_BODY_MAX} characters`),
});

/** Full-screen form: plain text to everyone or to one course's owners. */
export function AnnouncementFormScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canPublishAnnouncements(access.data);
  const courses = useQuery({
    queryKey: ["staff-courses", "announce"],
    queryFn: () => staffCourseApi.list(),
    enabled: allowed,
  });
  const { control, handleSubmit, setError } = useZodForm(formSchema, { title: "", body: "" });
  const [courseId, setCourseId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The same key for every retry of this draft, so a lost answer cannot post it twice.
  const key = useRef(newAnnouncementKey());
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/profile/staff-announcements");

  const { run, pending } = useSubmitOnce(async (v: z.output<typeof formSchema>) => {
    setMessage(null);
    try {
      await staffAnnouncementApi.publish({
        title: v.title,
        body: v.body,
        ...(courseId ? { courseId } : {}),
        idempotencyKey: key.current,
      });
      await qc.invalidateQueries({ queryKey: ["staff-announcements"] });
      AccessibilityInfo.announceForAccessibility("Announcement posted");
      back();
    } catch (e) {
      if (isAppError(e) && e.kind === "forbidden") {
        void qc.invalidateQueries({ queryKey: ["access"] });
        setMessage("You no longer have permission to do this. What you typed is still here.");
        return;
      }
      if (isAppError(e) && e.kind === "not_found") {
        setMessage("That course no longer exists. Choose another audience.");
        return;
      }
      if (!applyServerErrors(e, setError, ["title", "body"])) {
        setMessage(isAppError(e) ? e.message : messageFor("unknown"));
      }
    }
  });

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
          message="Only Admins and Managers can post announcements."
          actionLabel="Back"
          onAction={back}
        />
      </Screen>
    );
  }
  const list = courses.data?.items ?? [];
  return (
    <Screen>
      <StaffPageHeader title="New announcement" eyebrow="OPERATIONS" icon="inbox" />
      {message ? <Banner kind="error" message={message} testID="ann-form-error" /> : null}
      <FormField
        control={control}
        name="title"
        label="Title"
        maxLength={ANNOUNCEMENT_TITLE_MAX + 10}
      />
      <FormField
        control={control}
        name="body"
        label="Message (plain text)"
        multiline
        maxLength={ANNOUNCEMENT_BODY_MAX + 10}
      />
      <Text variant="subheading">Who sees it</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip label="Everyone" selected={courseId === null} onPress={() => setCourseId(null)} />
        {list.map((c) => (
          <Chip
            key={c.id}
            label={c.title}
            selected={courseId === c.id}
            onPress={() => setCourseId(c.id)}
          />
        ))}
      </View>
      {courses.status === "error" ? (
        <Text variant="caption" tone="muted">
          Courses could not be loaded, so only Everyone is offered.
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {courseId
          ? "Only people with access to this course will see it."
          : "Everyone with an account will see it."}
      </Text>
      <Button label="Post" loading={pending} onPress={() => void handleSubmit(run)()} />
      <Button label="Back" variant="tertiary" onPress={back} />
    </Screen>
  );
}
