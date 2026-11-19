import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useRef, useState } from "react";
import { AccessibilityInfo, Switch, View } from "react-native";
import {
  MAX_RESOURCE_BYTES,
  RESOURCE_MIME_TYPES,
  RESOURCE_TITLE_MAX,
  type ResourceMimeType,
  type StaffResource,
} from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { ConfirmDialog } from "../auth/ConfirmDialog";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, spacing } from "../theme";
import { Banner, BottomSheet, Button, NameSheet, Text, TextField } from "../ui";
import { staffResourceApi } from "./resource-api";
import { describeFile, mimeFor, UploadCancelled, uploadFile } from "./upload";

export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: ResourceMimeType;
}

/** The system file picker, kept separate so tests can replace it. */
export const filePicker = {
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

/** Checks a picked file before uploading: a supported type and at most 50 MB. */
export function checkPicked(p: {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}): PickedFile | string {
  const mimeType = mimeFor(p.name, p.mimeType);
  if (!mimeType)
    return "This file type is not supported. Use PDF, PNG, JPEG, WebP, Word (.docx) or plain text.";
  if (!p.size || p.size <= 0) return "This file is empty or could not be read.";
  if (p.size > MAX_RESOURCE_BYTES) return "Files can be up to 50 MB.";
  return { uri: p.uri, name: p.name, size: p.size, mimeType };
}

const titleFrom = (name: string) =>
  name.replace(/\.[^.]+$/, "").slice(0, RESOURCE_TITLE_MAX) || "File";

/** Staff manage a lesson's files: add with progress, cancel, retry, rename, download switch, replace, delete. */
export function StaffLessonFiles({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["staff-files", courseId, lessonId],
    queryFn: () => staffResourceApi.list(courseId, lessonId),
    retry: shouldRetry,
  });
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [replacing, setReplacing] = useState<StaffResource | null>(null);
  const [title, setTitle] = useState("");
  const [downloadable, setDownloadable] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [renaming, setRenaming] = useState<StaffResource | null>(null);
  const [deleting, setDeleting] = useState<StaffResource | null>(null);
  const controller = useRef<AbortController | null>(null);
  const addRef = useRef(null);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["staff-files", courseId, lessonId] }),
      qc.invalidateQueries({ queryKey: ["lesson-files", courseId, lessonId] }),
    ]);
  };
  const explain = (e: unknown): string => {
    if (isAppError(e) && e.kind === "forbidden")
      return "You no longer have permission to change this lesson's files.";
    if (isAppError(e) && e.kind === "validation") return e.fields[0]?.message ?? e.message;
    return isAppError(e) ? e.message : messageFor("unknown");
  };

  const choose = async (replace: StaffResource | null) => {
    setMessage(null);
    const p = await filePicker.pick();
    if (!p) return;
    const checked = checkPicked(p);
    if (typeof checked === "string") {
      setMessage(checked);
      AccessibilityInfo.announceForAccessibility(checked);
      return;
    }
    setReplacing(replace);
    setTitle(replace?.title ?? titleFrom(checked.name));
    setDownloadable(replace?.downloadable ?? false);
    setFailed(false);
    setPicked(checked);
  };

  const start = async () => {
    if (!picked || progress !== null) return;
    if (title.trim().length === 0) {
      setMessage("Enter a title");
      return;
    }
    setMessage(null);
    setFailed(false);
    controller.current = new AbortController();
    setProgress(0);
    try {
      await uploadFile({
        courseId,
        lessonId,
        uri: picked.uri,
        fileName: picked.name,
        mimeType: picked.mimeType,
        size: picked.size,
        title: title.trim(),
        ...(replacing ? { replaceResourceId: replacing.id } : { downloadable }),
        onProgress: (p) => setProgress(p),
        signal: controller.current.signal,
      });
      setPicked(null);
      await refresh();
      AccessibilityInfo.announceForAccessibility(
        replacing ? "File replaced" : `${title.trim()} added`,
      );
    } catch (e) {
      if (e instanceof UploadCancelled) {
        AccessibilityInfo.announceForAccessibility("Upload cancelled");
        setPicked(null);
      } else {
        setFailed(true);
        setMessage(explain(e));
        AccessibilityInfo.announceForAccessibility("Upload failed");
      }
    } finally {
      setProgress(null);
      controller.current = null;
    }
  };

  const toggle = async (r: StaffResource) => {
    setMessage(null);
    try {
      await staffResourceApi.update(courseId, lessonId, r.id, {
        expectedVersion: r.version,
        downloadable: !r.downloadable,
      });
      await refresh();
      AccessibilityInfo.announceForAccessibility(
        `Students can ${r.downloadable ? "no longer" : "now"} download ${r.title}`,
      );
    } catch (e) {
      setMessage(
        isAppError(e) && e.kind === "conflict"
          ? "This file was changed by someone else. The list is up to date now."
          : explain(e),
      );
      await refresh();
    }
  };

  const items = list.data ?? [];
  return (
    <View style={{ gap: spacing.sm }} testID="staff-files">
      <Text variant="subheading" accessibilityRole="header">
        Files
      </Text>
      <Text variant="caption" tone="muted">
        PDF, images, Word (.docx) or text, up to 50 MB. Students can only view files unless you
        allow downloads.
      </Text>
      {message ? <Banner kind="error" message={message} testID="staff-files-error" /> : null}
      {list.status === "pending" ? (
        <Text tone="muted">Loading files…</Text>
      ) : list.status === "error" ? (
        <StateView
          state={isAppError(list.error) && list.error.kind === "network" ? "offline" : "error"}
          message={
            isAppError(list.error) && list.error.kind === "forbidden"
              ? "You do not have permission to manage this lesson's files."
              : "Files could not be loaded."
          }
          onAction={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <Text tone="muted" testID="staff-files-empty">
          No files yet.
        </Text>
      ) : (
        items.map((r) => (
          <View
            key={r.id}
            testID={`staff-file-${r.id}`}
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
              {describeFile(r.mimeType, r.sizeBytes)},{" "}
              {r.scanStatus === "clean" ? "scanned" : "not scanned"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              <Button
                label={`Downloads ${r.downloadable ? "on" : "off"}`}
                variant="secondary"
                accessibilityLabel={`Students can download ${r.title}: ${r.downloadable ? "on" : "off"}`}
                onPress={() => void toggle(r)}
              />
              <Button
                label="Rename"
                variant="secondary"
                accessibilityLabel={`Rename ${r.title}`}
                onPress={() => setRenaming(r)}
              />
              <Button
                label="Replace"
                variant="secondary"
                accessibilityLabel={`Replace ${r.title}`}
                onPress={() => void choose(r)}
              />
              <Button
                label="Delete"
                variant="tertiary"
                accessibilityLabel={`Delete ${r.title}`}
                onPress={() => setDeleting(r)}
              />
            </View>
          </View>
        ))
      )}
      <View ref={addRef} collapsable={false}>
        <Button label="Add file" variant="secondary" onPress={() => void choose(null)} />
      </View>

      <BottomSheet
        visible={picked !== null}
        title={replacing ? "Replace file" : "Add file"}
        onDismiss={() => (progress === null ? setPicked(null) : undefined)}
        openerRef={addRef}
      >
        <Text>{picked ? `${picked.name}: ${describeFile(picked.mimeType, picked.size)}` : ""}</Text>
        {message ? <Banner kind="error" message={message} testID="upload-error" /> : null}
        <TextField
          label="File title"
          value={title}
          onChangeText={setTitle}
          maxLength={RESOURCE_TITLE_MAX + 10}
        />
        {!replacing ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              Students can download
            </Text>
            <Switch
              accessibilityRole="switch"
              accessibilityLabel="Students can download"
              accessibilityState={{ checked: downloadable }}
              value={downloadable}
              onValueChange={setDownloadable}
              trackColor={{ true: colors.blue }}
            />
          </View>
        ) : null}
        {progress !== null ? (
          <>
            <Text accessibilityLiveRegion="polite" testID="upload-progress">
              Uploading, {progress} percent
            </Text>
            <Button
              label="Cancel upload"
              variant="secondary"
              onPress={() => controller.current?.abort()}
            />
          </>
        ) : (
          <>
            <Button
              label={failed ? "Try again" : replacing ? "Upload new file" : "Upload"}
              onPress={() => void start()}
            />
            <Button label="Cancel" variant="secondary" onPress={() => setPicked(null)} />
          </>
        )}
      </BottomSheet>

      <NameSheet
        visible={renaming !== null}
        title="Rename file"
        label="File title"
        min={1}
        max={RESOURCE_TITLE_MAX}
        initialName={renaming?.title ?? ""}
        confirmLabel="Save title"
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return;
          await staffResourceApi.update(courseId, lessonId, renaming.id, {
            expectedVersion: renaming.version,
            title: name,
          });
          setRenaming(null);
          await refresh();
          AccessibilityInfo.announceForAccessibility("File renamed");
        }}
      />
      <ConfirmDialog
        visible={deleting !== null}
        title={`Delete ${deleting?.title ?? "file"}?`}
        message="Students will no longer see this file. This cannot be undone."
        confirmLabel="Delete file"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await staffResourceApi.remove(courseId, lessonId, deleting.id);
          const t = deleting.title;
          setDeleting(null);
          await refresh();
          AccessibilityInfo.announceForAccessibility(`${t} deleted`);
        }}
      />
    </View>
  );
}
