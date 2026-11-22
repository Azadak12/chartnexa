import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  TIP_BODY_MAX,
  TIP_BODY_MIN,
  TIP_CATEGORIES,
  TIP_CATEGORY_LABEL,
  type TipCategory,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { canPublishAnnouncements, fetchAccess, staffCourseApi } from "../courses/course-api";
import { StaffPageHeader } from "../kit/StaffPageHeader";
import { StateView } from "../state/StateView";
import { neutrals, raised, spacing } from "../theme";
import { Banner, Button, Chip, Screen, StatusPill, Text, TextField } from "../ui";
import { staffTipApi } from "./tip-api";

/** Staff write the tips learners see on Home, one per day in rotation, and archive old ones. */
export function StaffTipsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canPublishAnnouncements(access.data);
  const tips = useQuery({ queryKey: ["staff-tips"], queryFn: staffTipApi.list, enabled: allowed });
  const courses = useQuery({
    queryKey: ["staff-courses", "tips"],
    queryFn: () => staffCourseApi.list({ status: "published" }),
    enabled: allowed,
  });
  const [category, setCategory] = useState<TipCategory>("risk_management");
  const [body, setBody] = useState("");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["staff-tips"] }),
      qc.invalidateQueries({ queryKey: ["tip-of-the-day"] }),
    ]);
  const fail = (e: unknown) => {
    if (isAppError(e) && e.kind === "forbidden") {
      void qc.invalidateQueries({ queryKey: ["access"] });
      setMessage("You no longer have permission to do this.");
    } else setMessage(isAppError(e) ? e.message : messageFor("unknown"));
  };
  const add = useMutation({
    mutationFn: () =>
      staffTipApi.create({ category, body: body.trim(), ...(courseId ? { courseId } : {}) }),
    onMutate: () => setMessage(null),
    onSuccess: async () => {
      setBody("");
      setCourseId(null);
      await refresh();
    },
    onError: fail,
  });
  const archive = useMutation({
    mutationFn: (id: string) => staffTipApi.archive(id),
    onMutate: () => setMessage(null),
    onSuccess: refresh,
    onError: fail,
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/profile"));
  const length = body.trim().length;
  const valid = length >= TIP_BODY_MIN && length <= TIP_BODY_MAX;

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
          message="Only Admins and Managers can manage tips."
          actionLabel="Back"
          onAction={back}
        />
      </Screen>
    );
  }
  const items = tips.data ?? [];
  const active = items.filter((t) => t.status === "active");
  return (
    <Screen>
      <StaffPageHeader title="Tips of the day" eyebrow="OPERATIONS" icon="sun" />
      <Text tone="muted">
        Learners see one active tip a day, in the order they were written. {active.length} active.
      </Text>
      {message ? <Banner kind="error" message={message} testID="tip-error" /> : null}
      <View style={{ ...raised, padding: spacing.lg, gap: spacing.md }} testID="tip-form">
        <Text variant="bodyStrong">New tip</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {TIP_CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={TIP_CATEGORY_LABEL[c]}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>
        <TextField
          label="Tip"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={TIP_BODY_MAX + 20}
          error={length > TIP_BODY_MAX ? `Use at most ${TIP_BODY_MAX} characters` : undefined}
        />
        <Text variant="caption" tone="muted">
          {length}/{TIP_BODY_MAX} characters. Educational wording, not advice to buy or sell.
        </Text>
        {(courses.data?.items ?? []).length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="bodyStrong">Learn more link (optional)</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              <Chip label="No link" selected={!courseId} onPress={() => setCourseId(null)} />
              {(courses.data?.items ?? []).slice(0, 8).map((c) => (
                <Chip
                  key={c.id}
                  label={c.title}
                  selected={courseId === c.id}
                  onPress={() => setCourseId(c.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <Button
          label="Add tip"
          disabled={!valid}
          loading={add.isPending}
          onPress={() => add.mutate()}
        />
      </View>

      {tips.status === "pending" ? (
        <StateView state="loading" />
      ) : tips.status === "error" ? (
        <StateView
          state="error"
          message={isAppError(tips.error) ? tips.error.message : messageFor("unknown")}
          onAction={() => void tips.refetch()}
        />
      ) : items.length === 0 ? (
        <StateView
          state="empty"
          title="No tips yet"
          message="Add the first tip. Until then learners see no tip card."
        />
      ) : (
        items.map((t) => (
          <View
            key={t.id}
            testID={`tip-${t.id}`}
            style={{ ...raised, padding: spacing.md, gap: spacing.xs }}
          >
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
              <StatusPill
                label={t.status === "active" ? "Active" : "Archived"}
                tone={t.status === "active" ? "success" : "neutral"}
                icon={t.status === "active" ? "check-circle" : "archive"}
              />
              <Text variant="caption" tone="muted">
                {TIP_CATEGORY_LABEL[t.category]}
              </Text>
            </View>
            <Text>{t.body}</Text>
            {t.courseTitle ? (
              <Text variant="caption" tone="muted" style={{ color: neutrals.muted }}>
                Links to {t.courseTitle}
              </Text>
            ) : null}
            {t.status === "active" ? (
              <Button
                label="Archive"
                variant="tertiary"
                accessibilityLabel={`Archive tip: ${t.body}`}
                loading={archive.isPending && archive.variables === t.id}
                onPress={() => archive.mutate(t.id)}
              />
            ) : null}
          </View>
        ))
      )}
      <Button label="Back" variant="tertiary" onPress={back} />
    </Screen>
  );
}
