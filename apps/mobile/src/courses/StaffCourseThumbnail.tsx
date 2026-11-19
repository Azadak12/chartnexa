import * as DocumentPicker from "expo-document-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { THUMBNAIL_MAX_BYTES, THUMBNAIL_TYPES } from "@chartnexa/api-contracts";
import { authedFetch } from "../auth/authed-fetch";
import { isAppError, messageFor } from "../api/errors";
import { fileReader } from "../resources/upload";
import { spacing } from "../theme";
import { Banner, Button, Text } from "../ui";
import { CoverBlock } from "./CoverBlock";
import type { CourseTone } from "@chartnexa/api-contracts";

export const imagePicker = {
  async pick(): Promise<{ uri: string; name: string; size?: number; mimeType?: string } | null> {
    const res = await DocumentPicker.getDocumentAsync({
      type: [...THUMBNAIL_TYPES],
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

/** Checks a picked image before sending it: a supported type and at most 2 MB. */
export function checkImage(p: { size?: number; mimeType?: string }): string | null {
  if (p.mimeType && !(THUMBNAIL_TYPES as readonly string[]).includes(p.mimeType)) {
    return "Use a PNG, JPEG or WebP image.";
  }
  if (p.size !== undefined && p.size > THUMBNAIL_MAX_BYTES) {
    return `Use an image of at most ${THUMBNAIL_MAX_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

/** The course picture for staff: choose an image, see it, or go back to the colour cover. */
export function StaffCourseThumbnail({
  courseId,
  tone,
  initialUrl,
}: {
  courseId: string;
  tone: CourseTone;
  initialUrl: string | null;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const path = `/staff/courses/${encodeURIComponent(courseId)}/thumbnail`;

  const done = (text: string, next: string | null) => {
    setUrl(next);
    setMessage({ ok: true, text });
    AccessibilityInfo.announceForAccessibility(text);
    void qc.invalidateQueries({ queryKey: ["catalog"] });
    void qc.invalidateQueries({ queryKey: ["course", courseId] });
  };
  const fail = (e: unknown) =>
    setMessage({ ok: false, text: isAppError(e) ? e.message : messageFor("unknown") });

  const choose = async () => {
    if (busy) return;
    setMessage(null);
    const picked = await imagePicker.pick();
    if (!picked) return;
    const problem = checkImage(picked);
    if (problem) {
      setMessage({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    try {
      const size = picked.size ?? THUMBNAIL_MAX_BYTES;
      const bytes = await fileReader.readPart(picked.uri, 0, size);
      const res = await authedFetch<{ thumbnailUrl: string }>(path, {
        method: "PUT",
        rawBody: bytes,
        timeoutMs: 60_000,
      });
      done("Thumbnail saved.", res.thumbnailUrl);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await authedFetch(path, { method: "DELETE" });
      done("Thumbnail removed. The colour cover is shown.", null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing.sm }} testID="course-thumbnail">
      <Text variant="subheading" accessibilityRole="header">
        Thumbnail
      </Text>
      <CoverBlock tone={tone} height={150} thumbnailUrl={url} />
      <Text variant="caption" tone="muted">
        PNG, JPEG or WebP, up to 2 MB. A 16:9 picture looks best.
      </Text>
      {message ? (
        <Banner kind={message.ok ? "success" : "error"} message={message.text} testID="thumb-msg" />
      ) : null}
      <Button
        label={url ? "Replace thumbnail" : "Choose thumbnail"}
        variant="secondary"
        loading={busy}
        onPress={() => void choose()}
      />
      {url ? (
        <Button
          label="Remove thumbnail"
          variant="tertiary"
          disabled={busy}
          onPress={() => void remove()}
        />
      ) : null}
    </View>
  );
}
