import type { ObjectStorage } from "./storage.js";

async function bytes(
  storage: ObjectStorage,
  key: string,
  start: number,
  length: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of storage.readRange(key, start, start + length - 1)) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

/** Reads one box header (size and type) at `offset`; 64-bit sizes are supported. */
async function boxAt(storage: ObjectStorage, key: string, offset: number, limit: number) {
  if (offset + 8 > limit) return null;
  const h = await bytes(storage, key, offset, 16);
  if (h.length < 8) return null;
  let size = h.readUInt32BE(0);
  const type = h.toString("latin1", 4, 8);
  let header = 8;
  if (size === 1) {
    if (h.length < 16) return null;
    size = Number(h.readBigUInt64BE(8));
    header = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (size < header || offset + size > limit) return null;
  return { type, size, header };
}

/**
 * Checks that an object is an MP4 (first box `ftyp`) and returns its duration in whole seconds
 * from `moov/mvhd`, reading only box headers and the small `mvhd` box. Null when it is not an MP4
 * or the duration cannot be found.
 */
export async function mp4Duration(
  storage: ObjectStorage,
  key: string,
  size: number,
): Promise<{ isMp4: boolean; durationSeconds: number | null }> {
  const first = await boxAt(storage, key, 0, size);
  if (!first || first.type !== "ftyp") return { isMp4: false, durationSeconds: null };
  let offset = 0;
  for (let i = 0; i < 64 && offset < size; i++) {
    const box = await boxAt(storage, key, offset, size);
    if (!box) break;
    if (box.type === "moov") {
      let inner = offset + box.header;
      const end = offset + box.size;
      for (let j = 0; j < 64 && inner < end; j++) {
        const child = await boxAt(storage, key, inner, end);
        if (!child) break;
        if (child.type === "mvhd") {
          const body = await bytes(
            storage,
            key,
            inner + child.header,
            Math.min(child.size - child.header, 40),
          );
          const version = body[0];
          const timescale = version === 1 ? body.readUInt32BE(20) : body.readUInt32BE(12);
          const duration = version === 1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
          if (!timescale || !duration) return { isMp4: true, durationSeconds: null };
          return { isMp4: true, durationSeconds: Math.max(1, Math.round(duration / timescale)) };
        }
        inner += child.size;
      }
      return { isMp4: true, durationSeconds: null };
    }
    offset += box.size;
  }
  return { isMp4: true, durationSeconds: null };
}
