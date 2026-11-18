import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import { categoryApi, staffCategoryApi } from "../src/categories/category-api";
import { courseApi, staffCourseApi } from "../src/courses/course-api";
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
afterEach(() => sessionManager._resetForTests());

async function newAccount(): Promise<string> {
  const email = uniqueEmail();
  await authHttp.register({ email, password: GOOD_PASSWORD });
  await authHttp.verifyEmail(await waitForToken(email, "Verify your ChartNexa email"));
  return email;
}
async function signInAs(email: string): Promise<void> {
  secure.__reset();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(await loginAny(email, GOOD_PASSWORD));
}
const failure = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected a failure");
};

describe("Categories against the real API", () => {
  it("staff create, assign and protect categories; the catalog filters by them", async () => {
    const adminEmail = await newAccount();
    const studentEmail = await newAccount();
    makeAdmin(adminEmail);

    await signInAs(adminEmail);
    const name = `Forex ${Date.now()}`;
    const cat = await staffCategoryApi.create(name);
    expect((await failure(staffCategoryApi.create(name.toUpperCase()))).kind).toBe("validation");
    const course = await staffCourseApi.create({
      title: "Category contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
      categoryId: cat.id,
    });
    await staffCourseApi.publish(course.id);
    expect((await failure(staffCategoryApi.remove(cat.id))).kind).toBe("conflict");
    const renamed = await staffCategoryApi.rename(cat.id, cat.version, `${name} pairs`);
    expect(renamed.version).toBe(2);

    await signInAs(studentEmail);
    expect((await failure(staffCategoryApi.create("Not allowed"))).kind).toBe("forbidden");
    const listed = (await categoryApi.list()).find((c) => c.id === cat.id);
    expect(listed).toEqual({ id: cat.id, name: `${name} pairs`, courseCount: 1 });
    const page = await courseApi.list({ category: cat.id });
    expect(page.items.map((c) => c.id)).toEqual([course.id]);
    expect((await courseApi.get(course.id)).categoryId).toBe(cat.id);
  });
});
