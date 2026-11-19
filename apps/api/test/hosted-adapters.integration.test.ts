import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CoursesService } from "../src/modules/courses/index.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { ClamAvScanner } from "../src/modules/resources/clamav-scanner.js";
import { OBJECT_STORAGE, type ObjectStorage } from "../src/modules/resources/storage.js";
import { person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

const drain = async (s: NodeJS.ReadableStream): Promise<Buffer> => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(Buffer.from(c as Buffer));
  return Buffer.concat(parts);
};

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let storage: ObjectStorage;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url, {
    STORAGE_DRIVER: "postgres",
    VIDEO_PROVIDER: "direct",
    PAYMENT_PROVIDER: "disabled",
  });
  storage = h.t.app.get<ObjectStorage>(OBJECT_STORAGE);
  admin = await person(h, "admin");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

describe("the database-backed object storage", () => {
  it("stores, reads whole and by range, replaces and deletes", async () => {
    const data = randomBytes(2_500_000); // more than two read chunks
    await storage.put("t/a", data);
    expect(await storage.size("t/a")).toBe(data.length);
    expect((await drain(storage.read("t/a"))).equals(data)).toBe(true);
    expect(
      (await drain(storage.readRange("t/a", 1_048_570, 1_048_590))).equals(
        data.subarray(1_048_570, 1_048_591),
      ),
    ).toBe(true);
    expect((await drain(storage.readRange("t/a", 0, 9))).equals(data.subarray(0, 10))).toBe(true);
    // A range past the end returns what exists.
    expect((await drain(storage.readRange("t/a", data.length - 3, data.length + 50))).length).toBe(
      3,
    );
    await storage.put("t/a", Buffer.from("new"));
    expect((await drain(storage.read("t/a"))).toString()).toBe("new");
    await storage.delete("t/a");
    expect(await storage.size("t/a")).toBeNull();
    await expect(drain(storage.read("t/a"))).rejects.toThrow();
  });

  it("handles empty objects, joins parts in order, lists and deletes by prefix", async () => {
    await storage.put("u/empty", Buffer.alloc(0));
    expect((await drain(storage.read("u/empty"))).length).toBe(0);
    await storage.put("u/p/1", Buffer.from("abc"));
    await storage.put("u/p/2", Buffer.from("def"));
    await storage.put("u/p/3", Buffer.from("g"));
    await storage.compose(["u/p/1", "u/p/2", "u/p/3"], "u/whole");
    expect((await drain(storage.read("u/whole"))).toString()).toBe("abcdefg");
    expect(await storage.size("u/whole")).toBe(7);
    await expect(storage.compose(["u/p/1", "u/p/missing"], "u/bad")).rejects.toThrow();
    expect(await storage.size("u/bad")).toBeNull();
    const listed = (await storage.list("u")).map((o) => o.key).sort();
    expect(listed).toEqual(["u/empty", "u/p/1", "u/p/2", "u/p/3", "u/whole"]);
    await storage.delete("u/p");
    expect((await storage.list("u")).map((o) => o.key).sort()).toEqual(["u/empty", "u/whole"]);
    // A sibling that merely shares the start of the name is not a child.
    await storage.put("u/pp", Buffer.from("x"));
    await storage.delete("u/p");
    expect(await storage.size("u/pp")).toBe(1);
  });

  it("refuses keys that could escape or be malformed, and the database enforces the shape", async () => {
    for (const bad of ["../x", "a/../b", "/abs", "UPPER", "a b", "", "a".repeat(250)]) {
      await expect(storage.put(bad, Buffer.from("x")), bad).rejects.toThrow();
    }
    const db = h.t.app.get(PrismaService);
    await expect(
      db.$executeRaw`INSERT INTO storage_objects (key, data, size_bytes) VALUES ('Bad Key', 'x'::bytea, 1)`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`INSERT INTO storage_objects (key, data, size_bytes) VALUES ('ok/key', 'x'::bytea, 99)`,
    ).rejects.toThrow();
  });
});

describe("through the API with hosted adapters", () => {
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 1),
  ]);
  it("serves a course thumbnail that is kept in the database, publicly and unchanged", async () => {
    const svc = h.t.app.get(CoursesService);
    const c = await svc.create(
      admin.id,
      {
        title: "Hosted",
        description: "A complete description",
        level: "beginner",
        priceCents: 0,
        coverTone: "blue",
      } as never,
      "rq",
    );
    const res = await h.t.app.inject({
      method: "PUT",
      url: `/staff/courses/${c.id}/thumbnail`,
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        "content-type": "application/octet-stream",
      },
      payload: PNG,
    });
    expect(res.statusCode).toBe(200);
    const { thumbnailUrl } = res.json() as { thumbnailUrl: string };
    const img = await h.t.app.inject({ method: "GET", url: thumbnailUrl });
    expect(img.statusCode).toBe(200);
    expect(img.rawPayload.equals(PNG)).toBe(true);
    const db = h.t.app.get(PrismaService);
    expect(await db.storageObject.count()).toBeGreaterThan(0);
  });

  it("refuses every purchase and every payment event when no provider is connected", async () => {
    const svc = h.t.app.get(CoursesService);
    const c = await svc.create(
      admin.id,
      {
        title: "Paid",
        description: "A complete description",
        level: "beginner",
        priceCents: 4900,
        coverTone: "blue",
      } as never,
      "rq",
    );
    await svc.publish(admin.id, c.id, "rp");
    const buyer = await person(h);
    const buy = await h.call("POST", "/me/orders", {
      token: buyer.accessToken,
      body: { courseId: c.id },
      headers: { "idempotency-key": "11111111-1111-4111-8111-111111111111" },
    });
    expect(buy.statusCode).toBe(503);
    expect(buy.body).toMatch(/not available yet/);
    const ev = { id: "e1", type: "paid", checkoutRef: "x", amountCents: 4900 };
    for (const provider of ["test", "disabled"]) {
      const r = await h.call("POST", `/payments/webhooks/${provider}`, {
        body: ev,
        headers: { "x-payment-signature": "0".repeat(64) },
      });
      expect([401, 404], provider).toContain(r.statusCode);
    }
    const complete = await h.call(
      "POST",
      "/payments/test/checkouts/test_cs_11111111-1111-4111-8111-111111111111/complete",
      {
        token: buyer.accessToken,
        body: { outcome: "paid" },
      },
    );
    expect(complete.statusCode).toBe(403);
    expect(await h.db.order.count()).toBe(0);
    expect(await h.db.entitlement.count({ where: { userId: buyer.id } })).toBe(0);
  });
});

describe("the ClamAV scanner client", () => {
  let server: Server;
  let port: number;
  let mode: "ok" | "found" | "error" | "silent" = "ok";
  let received = Buffer.alloc(0);
  beforeAll(async () => {
    server = createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on("data", (d) => {
        buf = Buffer.concat([buf, d as Uint8Array]);
        // Command, then length-prefixed chunks, ended by a zero length.
        if (buf.subarray(0, 10).toString() !== "zINSTREAM\0") return;
        let at = 10;
        const body: Buffer[] = [];
        for (;;) {
          if (buf.length < at + 4) return;
          const n = buf.readUInt32BE(at);
          if (n === 0) break;
          if (buf.length < at + 4 + n) return;
          body.push(buf.subarray(at + 4, at + 4 + n));
          at += 4 + n;
        }
        received = Buffer.concat(body as Uint8Array[]);
        if (mode === "silent") return;
        const reply =
          mode === "ok"
            ? "stream: OK\0"
            : mode === "found"
              ? "stream: Eicar-Test-Signature FOUND\0"
              : "INSTREAM size limit exceeded. ERROR\0";
        sock.end(reply);
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("sends the whole file and maps the daemon's answer", async () => {
    const scanner = new ClamAvScanner("127.0.0.1", port, 2000);
    const file = randomBytes(200_000);
    mode = "ok";
    expect(await scanner.scan(file)).toBe("clean");
    expect(received.equals(file)).toBe(true);
    mode = "found";
    expect(await scanner.scan(file)).toBe("infected");
  });

  it("fails the upload, never passes it, when the daemon errs, stays silent or is down", async () => {
    const scanner = new ClamAvScanner("127.0.0.1", port, 300);
    mode = "error";
    await expect(scanner.scan(Buffer.from("x"))).rejects.toThrow(/cannot be checked/);
    mode = "silent";
    await expect(scanner.scan(Buffer.from("x"))).rejects.toThrow(/cannot be checked/);
    const down = new ClamAvScanner("127.0.0.1", 1, 300);
    await expect(down.scan(Buffer.from("x"))).rejects.toThrow(/cannot be checked/);
  });
});

describe("lesson files with the scanner off", () => {
  it("turns the upload of lesson files off completely", async () => {
    const db = await createIsolatedDb();
    const off = await makeHarness(db.url, { FILE_UPLOADS: "disabled" });
    try {
      const a = await person(off, "admin");
      const svc = off.t.app.get(CoursesService);
      const c = await svc.create(
        a.id,
        {
          title: "No files",
          description: "A complete description",
          level: "beginner",
          priceCents: 0,
          coverTone: "blue",
        } as never,
        "rq",
      );
      const r = await off.call(
        "POST",
        `/staff/courses/${c.id}/lessons/5b1c1a6e-3b7a-4a0c-9d3e-2f1a6b8c9d01/uploads`,
        {
          token: a.accessToken,
          body: { fileName: "a.pdf", mimeType: "application/pdf", size: 1000 },
        },
      );
      expect(r.statusCode).toBe(403);
      expect(r.body).toMatch(/not turned on/);
    } finally {
      await off.t.app.close();
      await db.drop();
    }
  });
});
