import { mp4Duration } from "./mp4.js";
import type { ObjectStorage } from "./storage.js";

export type IngestResult =
  | { status: "ready"; ref: string; durationSeconds: number }
  | { status: "failed"; errorCode: string };

/**
 * A video hosting and streaming service (processing, adaptive streaming, protected playback). The
 * provider is not chosen (Q09); real ones (for example a video platform with HLS and signed
 * playback) implement this. The app only ever sees a playback URL.
 */
export interface VideoProvider {
  readonly name: string;
  /** Takes an uploaded MP4 already in object storage under `key`. */
  ingest(key: string, sizeBytes: number): Promise<IngestResult>;
  /** Where the bytes or stream for `ref` can be fetched with the signed token. */
  playbackPath(videoId: string, token: string): string;
  remove(ref: string): Promise<void>;
}
export const VIDEO_PROVIDER = Symbol("VIDEO_PROVIDER");

/**
 * Test adapter, clearly not a production video service: it keeps the MP4 as uploaded in object
 * storage and serves it with HTTP ranges. No transcoding and no adaptive streaming. Production
 * configuration refuses it.
 */
export class TestVideoProvider implements VideoProvider {
  readonly name = "test";
  constructor(private readonly storage: ObjectStorage) {}

  async ingest(key: string, sizeBytes: number): Promise<IngestResult> {
    const info = await mp4Duration(this.storage, key, sizeBytes);
    if (!info.isMp4) return { status: "failed", errorCode: "NOT_MP4" };
    if (!info.durationSeconds) return { status: "failed", errorCode: "DURATION_UNKNOWN" };
    return { status: "ready", ref: key, durationSeconds: info.durationSeconds };
  }

  playbackPath(videoId: string, token: string): string {
    return `/videos/${videoId}/stream?t=${encodeURIComponent(token)}`;
  }

  async remove(ref: string): Promise<void> {
    await this.storage.delete(ref);
  }
}
