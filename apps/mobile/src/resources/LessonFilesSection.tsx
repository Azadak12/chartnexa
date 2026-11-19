import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { AccessibilityInfo, Linking, View } from "react-native";
import type { PublicResource } from "@chartnexa/api-contracts";
import { apiBaseUrl } from "../api/client";
import { isAppError, messageFor } from "../api/errors";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { neutrals, radii, spacing } from "../theme";
import { Banner, Button, Text } from "../ui";
import { resourceApi } from "./resource-api";
import { describeFile } from "./upload";

/** Opens files through a fresh short-lived link each time, so an old link never matters. */
export const fileOpener = {
  view: (url: string) => WebBrowser.openBrowserAsync(url),
  download: (url: string) => Linking.openURL(url),
};

/** A lesson's files for someone who may read the lesson. Nothing shows when there are none. */
export function LessonFilesSection({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const files = useQuery({
    queryKey: ["lesson-files", courseId, lessonId],
    queryFn: () => resourceApi.list(courseId, lessonId),
    retry: shouldRetry,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const open = async (r: PublicResource, download: boolean) => {
    if (busy) return;
    setBusy(r.id);
    setMessage(null);
    try {
      const link = await resourceApi.link(courseId, lessonId, r.id, download);
      const url = `${apiBaseUrl()}${link.url}`;
      await (download ? fileOpener.download(url) : fileOpener.view(url));
    } catch (e) {
      const text =
        isAppError(e) && e.kind === "forbidden"
          ? e.code === "DOWNLOAD_NOT_ALLOWED"
            ? "This file can be viewed but not downloaded."
            : "You no longer have access to this lesson's files."
          : isAppError(e) && e.kind === "not_found"
            ? "This file is no longer available."
            : isAppError(e)
              ? e.message
              : messageFor("unknown");
      setMessage(text);
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setBusy(null);
    }
  };

  if (files.status === "pending") {
    return (
      <Text tone="muted" accessibilityLabel="Loading files">
        Loading files…
      </Text>
    );
  }
  if (files.status === "error") {
    // Locked lessons answer 403; the reader already explains that, so show nothing here.
    if (isAppError(files.error) && files.error.kind === "forbidden") return null;
    return (
      <StateView
        state={isAppError(files.error) && files.error.kind === "network" ? "offline" : "error"}
        message="Files could not be loaded."
        onAction={() => void files.refetch()}
      />
    );
  }
  if (files.data.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }} testID="lesson-files">
      <Text variant="subheading" accessibilityRole="header">
        Files
      </Text>
      {message ? <Banner kind="error" message={message} testID="files-error" /> : null}
      {files.data.map((r) => (
        <View
          key={r.id}
          testID={`file-${r.id}`}
          style={{
            gap: spacing.xs,
            padding: spacing.md,
            borderRadius: radii.card,
            borderWidth: 1,
            borderColor: neutrals.divider,
          }}
        >
          <Text variant="bodyStrong">{r.title}</Text>
          <Text variant="caption" tone="muted">
            {describeFile(r.mimeType, r.sizeBytes)}
            {r.downloadable ? "" : ", view only"}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            <Button
              label={`Open ${r.title}`}
              variant="secondary"
              loading={busy === r.id}
              onPress={() => void open(r, false)}
            />
            {r.downloadable ? (
              <Button
                label={`Download ${r.title}`}
                variant="tertiary"
                onPress={() => void open(r, true)}
              />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
