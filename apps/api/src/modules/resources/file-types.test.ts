import { describe, expect, it } from "vitest";
import { isPlainText, safeFileName, sniffType } from "./file-types.js";
import { signFileGrant, verifyFileGrant } from "./file-token.js";
import { LocalDiskStorage } from "./storage.js";

const b = (...xs: number[]) => Buffer.from(xs);

describe("file type detection from bytes", () => {
  it("recognizes each allowed type by its signature", () => {
    expect(sniffType(Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(sniffType(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffType(b(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(
      sniffType(Buffer.concat([Buffer.from("RIFF"), b(0, 0, 0, 0), Buffer.from("WEBPVP8 ")])),
    ).toBe("image/webp");
    expect(
      sniffType(Buffer.concat([b(0x50, 0x4b, 0x03, 0x04), Buffer.from("word/document.xml")])),
    ).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(sniffType(Buffer.from("Hello\nworld\t!"))).toBe("text/plain");
  });

  it("refuses programs, other zips, scripts with control bytes and empty files", () => {
    expect(sniffType(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(10)]))).toBeNull();
    expect(sniffType(b(0x7f, 0x45, 0x4c, 0x46))).toBeNull(); // ELF
    expect(
      sniffType(Buffer.concat([b(0x50, 0x4b, 0x03, 0x04), Buffer.from("xl/workbook.xml")])),
    ).toBeNull();
    expect(sniffType(Buffer.from("text\u0000with nul"))).toBeNull();
    expect(sniffType(Buffer.alloc(0))).toBeNull();
    expect(
      sniffType(Buffer.concat([Buffer.from("RIFF"), b(0, 0, 0, 0), Buffer.from("AVI ")])),
    ).toBeNull();
  });

  it("treats invalid UTF-8 as not text", () => {
    expect(isPlainText(b(0xc3, 0x28))).toBe(false);
    expect(isPlainText(Buffer.from("Café"))).toBe(true);
  });

  it("cleans display file names", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\docs\\report.pdf")).toBe("report.pdf");
    expect(safeFileName('bad"\u0007name.pdf')).toBe("badname.pdf");
    expect(safeFileName("   ")).toBe("file");
    expect(safeFileName("x".repeat(300) + ".pdf")).toHaveLength(120);
  });
});

describe("signed file links", () => {
  const secret = "s".repeat(40);
  const grant = { resourceId: "r1", subject: "u1", download: false, expiresAt: 2_000_000 };

  it("verify for the same resource before expiry", () => {
    const t = signFileGrant(grant, secret);
    expect(verifyFileGrant(t, "r1", secret, 1_000_000)).toEqual(grant);
  });

  it("refuse another resource, expiry, a changed payload, another secret and junk", () => {
    const t = signFileGrant(grant, secret);
    expect(verifyFileGrant(t, "r2", secret, 1)).toBeNull();
    expect(verifyFileGrant(t, "r1", secret, 2_000_001)).toBeNull();
    const [payload, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify(["r1", "u1", 1, 2_000_000])).toString("base64url");
    expect(verifyFileGrant(`${forged}.${mac}`, "r1", secret, 1)).toBeNull();
    expect(verifyFileGrant(t, "r1", "o".repeat(40), 1)).toBeNull();
    for (const junk of ["", ".", "abc", `${payload}.`, "x".repeat(700)]) {
      expect(verifyFileGrant(junk, "r1", secret, 1)).toBeNull();
    }
  });
});

describe("local disk storage keys", () => {
  it("refuses keys that could leave the storage folder", async () => {
    const s = new LocalDiskStorage("/tmp/chartnexa-key-test");
    for (const key of ["../x", "/etc/passwd", "a/../../b", "A/B", "", "a b"]) {
      await expect(s.put(key, Buffer.from("x"))).rejects.toThrow("invalid storage key");
    }
  });
});
