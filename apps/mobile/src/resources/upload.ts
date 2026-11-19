import { File } from "expo-file-system";
import {
  RESOURCE_MIME_TYPES,
  type ResourceMimeType,
  type StaffResource,
  type UploadSession,
} from "@chartnexa/api-contracts";
import { isAppError } from "../api/errors";
import { staffResourceApi } from "./resource-api";

const BY_EXTENSION: Record<string, ResourceMimeType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

/** The type to declare: the picker's, if supported, otherwise from the extension. */
export function mimeFor(name: string, picked?: string | null): ResourceMimeType | null {
  if (picked && (RESOURCE_MIME_TYPES as readonly string[]).includes(picked)) {
    return picked as ResourceMimeType;
  }
  return BY_EXTENSION[name.toLowerCase().split(".").pop() ?? ""] ?? null;
}

/** Reads part n (1-based) of a picked file. Kept separate so tests can replace it. */
export const fileReader = {
  async readPart(uri: string, offset: number, length: number): Promise<Uint8Array> {
    const handle = new File(uri).open();
    try {
      handle.offset = offset;
      return await handle.readBytes(length);
    } finally {
      handle.close();
    }
  },
};

export interface UploadInput {
  courseId: string;
  lessonId: string;
  uri: string;
  fileName: string;
  mimeType: ResourceMimeType;
  size: number;
  title: string;
  downloadable?: boolean;
  replaceResourceId?: string;
  /** 0 to 100, after each part. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export class UploadCancelled extends Error {
  constructor() {
    super("Upload cancelled");
  }
}

const PART_ATTEMPTS = 3;

/**
 * Sends every part of a started upload. A failed part is retried (network errors only) before
 * giving up; cancelling tells the server so it removes what was sent.
 */
export async function sendParts(input: {
  courseId: string;
  session: UploadSession;
  uri: string;
  size: number;
  onProgress?: ((percent: number) => void) | undefined;
  signal?: AbortSignal | undefined;
}): Promise<void> {
  const { courseId, session } = input;
  const cancelled = async (): Promise<never> => {
    try {
      await staffResourceApi.cancel(courseId, session.uploadId);
    } catch {
      // The server also removes abandoned uploads after a day.
    }
    throw new UploadCancelled();
  };
  input.onProgress?.(0);
  for (let n = 1; n <= session.partCount; n++) {
    if (input.signal?.aborted) await cancelled();
    const offset = (n - 1) * session.partSize;
    const length = Math.min(session.partSize, input.size - offset);
    const bytes = await fileReader.readPart(input.uri, offset, length);
    for (let attempt = 1; ; attempt++) {
      try {
        await staffResourceApi.putPart(courseId, session.uploadId, n, bytes);
        break;
      } catch (e) {
        if (input.signal?.aborted) await cancelled();
        if (attempt >= PART_ATTEMPTS || !(isAppError(e) && e.kind === "network")) throw e;
      }
    }
    input.onProgress?.(Math.round((n / session.partCount) * 100));
  }
  if (input.signal?.aborted) await cancelled();
}

/** Uploads a lesson file in parts, then completes it. */
export async function uploadFile(input: UploadInput): Promise<StaffResource> {
  const session = await staffResourceApi.start(input.courseId, input.lessonId, {
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
  });
  await sendParts({ ...input, session });
  return staffResourceApi.complete(input.courseId, session.uploadId, {
    title: input.title,
    ...(input.downloadable !== undefined ? { downloadable: input.downloadable } : {}),
    ...(input.replaceResourceId ? { replaceResourceId: input.replaceResourceId } : {}),
  });
}

/** "PDF, 1.2 MB" — the type in words and the size, for labels and screen readers. */
export function describeFile(mimeType: string, size: number): string {
  const kind: Record<string, string> = {
    "application/pdf": "PDF",
    "image/png": "PNG image",
    "image/jpeg": "JPEG image",
    "image/webp": "WebP image",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
    "text/plain": "Text file",
  };
  const mb = size / (1024 * 1024);
  const sizeText = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${kind[mimeType] ?? "File"}, ${sizeText}`;
}
