import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import {
  courseApi,
  fetchAccess,
  canManageCourses,
  staffCourseApi,
} from "../src/courses/course-api";
import { sessionStore } from "../src/session/session-store";
import {
  GOOD_PASSWORD,
  loginAny,
  makeAdmin,
  realFetch,
  uniqueEmail,
  waitForToken,
} from "./helpers";

const secure = SecureStore as unknown as { __reset: () => void };

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = process.env.CONTRACT_API_URL;
  (globalThis as { fetch: unknown }).fetch = realFetch;
});
beforeEach(() => {
  secure.__reset();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
});
afterEach(() => sessionManager._resetForTests());

async function signInNew(role: "admin" | "student") {
  const email = uniqueEmail();
  await authHttp.register({ email, password: GOOD_PASSWORD });
  await authHttp.verifyEmail(await waitForToken(email, "Verify your ChartNexa email"));
  if (role === "admin") makeAdmin(email);
  await sessionManager.signIn(await loginAny(email, GOOD_PASSWORD));
  return email;
}

const failure = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected a failure");
};

const unique = () => `Contract ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe("courses against the real API", () => {
  it("runs the whole staff flow: create, edit, stale edit, publish, students see it, unpublish", async () => {
    await signInNew("admin");
    expect(canManageCourses(await fetchAccess())).toBe(true);

    const title = unique();
    const draft = await staffCourseApi.create({
      title,
      description: "Learn the basics of charts.",
      level: "beginner",
      priceCents: 4950,
      coverTone: "tint",
    });
    expect(draft).toMatchObject({
      status: "draft",
      version: 1,
      priceCents: 4950,
      currency: "USD",
      coverTone: "tint",
    });

    // Students (anyone) cannot see a draft.
    expect((await courseApi.list({ q: title })).items).toEqual([]);
    expect((await failure(courseApi.get(draft.id))).kind).toBe("not_found");

    const edited = await staffCourseApi.update(draft.id, { expectedVersion: 1, priceCents: 5900 });
    expect(edited).toMatchObject({ version: 2, priceCents: 5900 });
    const stale = await failure(
      staffCourseApi.update(draft.id, { expectedVersion: 1, title: `${title} stale` }),
    );
    expect(stale.kind).toBe("conflict");

    const published = await staffCourseApi.publish(draft.id);
    expect(published).toMatchObject({ status: "published", version: 3 });
    const found = await courseApi.list({ q: title.toLowerCase() });
    expect(found.items.map((c) => c.id)).toEqual([draft.id]);
    expect(found.items[0]).toMatchObject({
      priceCents: 5900,
      level: "beginner",
      coverTone: "tint",
    });
    const detail = await courseApi.get(draft.id);
    expect(detail).toMatchObject({
      title,
      description: "Learn the basics of charts.",
      currency: "USD",
    });
    expect(Object.keys(detail)).not.toContain("status");

    await staffCourseApi.unpublish(draft.id);
    expect((await failure(courseApi.get(draft.id))).kind).toBe("not_found");
    expect((await courseApi.list({ q: title })).items).toEqual([]);
  });

  it("maps server validation to field names the form understands", async () => {
    await signInNew("admin");
    const e = await failure(
      staffCourseApi.create({
        title: "ab",
        description: "x",
        level: "beginner",
        priceCents: 1_000_001,
        coverTone: "blue",
      } as never),
    );
    expect(e.kind).toBe("validation");
    expect(e.fields.map((f) => f.field).sort()).toEqual(["priceCents", "title"]);
  });

  it("refuses publishing an incomplete draft with a field reason", async () => {
    await signInNew("admin");
    const draft = await staffCourseApi.create({
      title: unique(),
      description: "",
      level: "advanced",
      priceCents: 0,
      coverTone: "black",
    });
    const e = await failure(staffCourseApi.publish(draft.id));
    expect(e.fields.map((f) => f.field)).toEqual(["description"]);
  });

  it("keeps staff routes closed to students while the catalog stays open", async () => {
    await signInNew("student");
    expect(canManageCourses(await fetchAccess())).toBe(false);
    expect((await failure(staffCourseApi.list())).kind).toBe("forbidden");
    expect(
      (
        await failure(
          staffCourseApi.create({
            title: unique(),
            description: "d",
            level: "beginner",
            priceCents: 100,
            coverTone: "blue",
          }),
        )
      ).kind,
    ).toBe("forbidden");
    await expect(courseApi.list()).resolves.toMatchObject({ items: expect.any(Array) });
  });

  it("pages the public catalog and the staff list", async () => {
    await signInNew("admin");
    const tag = unique();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const c = await staffCourseApi.create({
        title: `${tag} ${i}`,
        description: "d",
        level: "intermediate",
        priceCents: 100 * i,
        coverTone: "blue",
      });
      await staffCourseApi.publish(c.id);
      ids.push(c.id);
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await courseApi.list({ q: tag, limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.sort()).toEqual([...ids].sort());
    const staffPage = await staffCourseApi.list({ status: "published" });
    expect(staffPage.items.every((c) => c.status === "published")).toBe(true);
  });
});
