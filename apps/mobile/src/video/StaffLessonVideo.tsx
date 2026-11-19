import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { VIDEO_MAX_BYTES, VIDEO_MIME_TYPE } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { ConfirmDialog } from "../auth/ConfirmDialog";
import { UploadCancelled } from "../resources/upload";
import { shouldRetry } from "../state/query-client";
import { spacing } from "../theme";
import { Banner, Button, Text } from "../ui";
import { minutesText, staffVideoApi, uploadVideo } from "./video-api";

/** The system picker for videos, kept separate so tests can replace it. */
export const videoPicker = {
  async pick(): Promise<{ uri: string; name: string; size?: number } | null> {
    const res = await DocumentPicker.getDocumentAsync({
      type: [VIDEO_MIME_TYPE],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets[0]) return null;
    const a = res.assets[0];
    return { uri: a.uri, name: a.name, ...(a.size ? { size: a.size } : {}) };
  },
};

/** Staff upload, replace and remove a lesson's video, with progress, cancel and retry. */
export function StaffLessonVideo({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["staff-video", courseId, lessonId],
    queryFn: () => staffVideoApi.get(courseId, lessonId),
    retry: shouldRetry,
  });
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ uri: string; name: string; size: number } | null>(null);
  const [removing, setRemoving] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["staff-video", courseId, lessonId] }),
      qc.invalidateQueries({ queryKey: ["lesson-video", courseId, lessonId] }),
    ]);

  const send = async (file: { uri: string; name: string; size: number }) => {
    setMessage(null);
    setRetry(null);
    controller.current = new AbortController();
    setProgress(0);
    try {
      await uploadVideo({
        courseId,
        lessonId,
        ...file,
        fileName: file.name,
        onProgress: setProgress,
        signal: controller.current.signal,
      });
      await refresh();
      AccessibilityInfo.announceForAccessibility("Video added");
    } catch (e) {
      if (e instanceof UploadCancelled) {
        AccessibilityInfo.announceForAccessibility("Upload cancelled");
      } else {
        const text =
          isAppError(e) && e.kind === "validation"
            ? (e.fields[0]?.message ?? e.message)
            : isAppError(e) && e.kind === "forbidden"
              ? "You no longer have permission to change this lesson's video."
              : isAppError(e)
                ? e.message
                : messageFor("unknown");
        setMessage(text);
        setRetry(file);
        AccessibilityInfo.announceForAccessibility("Video upload failed");
      }
    } finally {
      setProgress(null);
      controller.current = null;
    }
  };

  const choose = async () => {
    const p = await videoPicker.pick();
    if (!p) return;
    if (!p.name.toLowerCase().endsWith(".mp4")) return setMessage("Use an MP4 video (.mp4).");
    if (!p.size) return setMessage("This video is empty or could not be read.");
    if (p.size > VIDEO_MAX_BYTES) return setMessage("Videos can be up to 1 GB.");
    await send({ uri: p.uri, name: p.name, size: p.size });
  };

  const v = q.data ?? null;
  return (
    <View style={{ gap: spacing.sm }} testID="staff-video">
      <Text variant="subheading" accessibilityRole="header">
        Video
      </Text>
      {message ? <Banner kind="error" message={message} testID="staff-video-error" /> : null}
      {q.status === "pending" ? (
        <Text tone="muted">Loading video…</Text>
      ) : q.status === "error" ? (
        <View style={{ gap: spacing.sm }}>
          <Text tone="muted">The video could not be loaded.</Text>
          <Button label="Retry" variant="secondary" onPress={() => void q.refetch()} />
        </View>
      ) : v ? (
        <Text testID="staff-video-status">
          {v.status === "ready"
            ? `Ready, ${minutesText(v.durationSeconds ?? 0)} (test video service, no adaptive streaming)`
            : v.status === "processing"
              ? "Processing"
              : "Processing failed"}
        </Text>
      ) : (
        <Text tone="muted">No video. Add an MP4 up to 1 GB.</Text>
      )}
      {progress !== null ? (
        <>
          <Text accessibilityLiveRegion="polite" testID="video-upload-progress">
            Uploading video, {progress} percent
          </Text>
          <Button
            label="Cancel video upload"
            variant="secondary"
            onPress={() => controller.current?.abort()}
          />
        </>
      ) : (
        <>
          {retry ? (
            <Button label="Try the video upload again" onPress={() => void send(retry)} />
          ) : null}
          <Button
            label={v ? "Replace video" : "Add video"}
            variant="secondary"
            onPress={() => void choose()}
          />
          {v ? (
            <Button label="Remove video" variant="tertiary" onPress={() => setRemoving(true)} />
          ) : null}
        </>
      )}
      <ConfirmDialog
        visible={removing}
        title="Remove this video?"
        message="Students will no longer see it, and their watching progress for it is removed. Lessons they completed stay complete."
        confirmLabel="Remove video"
        onCancel={() => setRemoving(false)}
        onConfirm={async () => {
          await staffVideoApi.remove(courseId, lessonId);
          setRemoving(false);
          await refresh();
          AccessibilityInfo.announceForAccessibility("Video removed");
        }}
      />
    </View>
  );
}
