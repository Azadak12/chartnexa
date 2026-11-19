import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mp4Duration } from "./mp4.js";
import { LocalDiskStorage } from "./storage.js";
import { parseRange } from "./video.service.js";

describe("range requests", () => {
  it("parse single ranges and clamp the end", () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual([0, 9]);
    expect(parseRange("bytes=90-", 100)).toEqual([90, 99]);
    expect(parseRange("bytes=-10", 100)).toEqual([90, 99]);
    expect(parseRange("bytes=-500", 100)).toEqual([0, 99]);
    expect(parseRange("bytes=50-1000", 100)).toEqual([50, 99]);
  });
  it("refuse ranges outside the file and ignore malformed ones", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=9-3", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
    expect(parseRange("bytes=-", 100)).toBeNull();
  });
});

const box = (type: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
};

describe("MP4 duration", () => {
  let dir: string;
  let s: LocalDiskStorage;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "chartnexa-mp4-"));
    s = new LocalDiskStorage(dir);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));
  const put = async (name: string, b: Buffer) => {
    await s.put(`videos/${name}`, b);
    return mp4Duration(s, `videos/${name}`, b.length);
  };

  it("reads version 0 and version 1 headers, with the movie box after the media data", async () => {
    const v0 = Buffer.alloc(100);
    v0.writeUInt32BE(600, 12);
    v0.writeUInt32BE(600 * 90, 16); // 90 s
    expect(
      await put(
        "a",
        Buffer.concat([
          box("ftyp", Buffer.alloc(8)),
          box("mdat", Buffer.alloc(500)),
          box("moov", box("mvhd", v0)),
        ]),
      ),
    ).toEqual({ isMp4: true, durationSeconds: 90 });
    const v1 = Buffer.alloc(112);
    v1[0] = 1;
    v1.writeUInt32BE(1000, 20);
    v1.writeBigUInt64BE(3_600_000n, 24); // 1 h
    expect(
      await put("b", Buffer.concat([box("ftyp", Buffer.alloc(8)), box("moov", box("mvhd", v1))])),
    ).toEqual({ isMp4: true, durationSeconds: 3600 });
  });

  it("says when it is not an MP4, or the length is missing or zero", async () => {
    expect((await put("c", Buffer.from("%PDF-1.7 not a video"))).isMp4).toBe(false);
    expect(
      await put("d", Buffer.concat([box("ftyp", Buffer.alloc(8)), box("mdat", Buffer.alloc(50))])),
    ).toEqual({ isMp4: true, durationSeconds: null });
    const zero = Buffer.alloc(100);
    zero.writeUInt32BE(1000, 12);
    expect(
      await put("e", Buffer.concat([box("ftyp", Buffer.alloc(8)), box("moov", box("mvhd", zero))])),
    ).toEqual({ isMp4: true, durationSeconds: null });
    // A box claiming to be larger than the file stops the walk safely.
    const bad = box("ftyp", Buffer.alloc(8));
    const lie = Buffer.alloc(8);
    lie.writeUInt32BE(10_000, 0);
    lie.write("moov", 4, "latin1");
    expect(await put("f", Buffer.concat([bad, lie]))).toEqual({
      isMp4: true,
      durationSeconds: null,
    });
  });
});
