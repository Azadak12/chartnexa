import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { categoryApi, staffCategoryApi } from "../src/categories/category-api";
import { courseApi, fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(), get: jest.fn() },
  staffCourseApi: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/categories/category-api", () => ({
  categoryApi: { list: jest.fn() },
  staffCategoryApi: { list: jest.fn(), create: jest.fn(), rename: jest.fn(), remove: jest.fn() },
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      displayName: "Ann",
      emailVerified: true,
      createdAt: "2026-11-17T00:00:00.000Z",
    }),
    resendVerification: jest.fn(),
  },
}));

const pub = categoryApi as unknown as { list: jest.Mock };
const staffCat = staffCategoryApi as unknown as Record<
  "list" | "create" | "rename" | "remove",
  jest.Mock
>;
const courses = courseApi as unknown as { list: jest.Mock };
const staffCourses = staffCourseApi as unknown as Record<"list" | "create", jest.Mock>;
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["course:create", "course:update", "categories:manage"],
  courseGrants: [],
};
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };
const cat = (id: string, name: string, courseCount = 1, total = courseCount) => ({
  id,
  name,
  courseCount,
  totalCourseCount: total,
  version: 1,
});
const press = (name: string) =>
  fireEvent.press(screen.getAllByRole("button", { name, ...hidden }).at(-1)!);
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label, hidden), text);

let announce: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  access.mockResolvedValue(MANAGER);
  pub.list.mockResolvedValue([cat("k1", "Forex", 3), cat("k2", "Crypto", 0)]);
  staffCat.list.mockResolvedValue([cat("k1", "Forex", 3, 4), cat("k2", "Crypto", 0, 0)]);
  courses.list.mockResolvedValue({ items: [], nextCursor: null });
  staffCourses.list.mockResolvedValue({ items: [], nextCursor: null });
});

describe("catalog topic filter", () => {
  it("shows topics that have courses and filters by the chosen one", async () => {
    await renderRouter(app, { initialUrl: "/home" });
    expect(await screen.findByTestId("category-filter")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forex" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Crypto" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Forex" }));
    await waitFor(() =>
      expect(courses.list).toHaveBeenLastCalledWith(expect.objectContaining({ category: "k1" })),
    );
    expect(screen.getByRole("button", { name: "Forex" }).props.accessibilityState.selected).toBe(
      true,
    );
    await fireEvent.press(screen.getByRole("button", { name: "All topics" }));
    // The unfiltered list is already cached, so it shows without a new request.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "All topics" }).props.accessibilityState.selected,
      ).toBe(true),
    );
  });

  it("still lists courses when categories fail to load", async () => {
    pub.list.mockRejectedValue(appError("server"));
    courses.list.mockResolvedValue({ items: [], nextCursor: null });
    await renderRouter(app, { initialUrl: "/home" });
    expect(await screen.findByText("No courses yet")).toBeTruthy();
    expect(screen.queryByTestId("category-filter")).toBeNull();
  });
});

describe("course form category", () => {
  it("sends the chosen category with a new course", async () => {
    staffCourses.create.mockResolvedValue({});
    await renderRouter(app, { initialUrl: "/manage/new" });
    await screen.findByTestId("category-picker");
    await fireEvent.press(await screen.findByRole("button", { name: "Forex" }));
    await type("Title", "Breakout trading");
    await type("Description", "When ranges break.");
    await type("Price in US dollars (0 for free)", "10");
    await press("Create draft");
    await waitFor(() =>
      expect(staffCourses.create).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "k1" }),
      ),
    );
  });
});

describe("staff categories screen", () => {
  it("is reachable from Manage courses only with the permission", async () => {
    await renderRouter(app, { initialUrl: "/manage" });
    await fireEvent.press(await screen.findByRole("button", { name: "Categories" }));
    expect(await screen.findByText("4 courses, 3 published")).toBeTruthy();
    await screen.unmount();
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/manage/categories" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(staffCat.list).toHaveBeenCalledTimes(1);
  });

  it("adds a category once, shows a taken name on the field, and announces success", async () => {
    staffCat.create
      .mockRejectedValueOnce(
        appError("validation", {
          fields: [{ field: "name", message: "A category with this name already exists" }],
        }),
      )
      .mockResolvedValue(cat("k3", "Options", 0));
    await renderRouter(app, { initialUrl: "/manage/categories" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add category" }));
    await type("Category name", "x");
    await press("Add category");
    expect(await screen.findByText("Use 2 to 40 characters", hidden)).toBeTruthy();
    await type("Category name", "Forex");
    await press("Add category");
    expect(
      await screen.findByText("A category with this name already exists", hidden),
    ).toBeTruthy();
    await type("Category name", "Options");
    await press("Add category");
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Category Options added"));
    expect(staffCat.create).toHaveBeenLastCalledWith("Options");
  });

  it("renames with the version it started from and recovers from a conflict", async () => {
    staffCat.rename.mockRejectedValueOnce(appError("conflict"));
    await renderRouter(app, { initialUrl: "/manage/categories" });
    await fireEvent.press(await screen.findByRole("button", { name: "Rename Forex" }));
    await type("Category name", "Currencies");
    await press("Save name");
    await waitFor(() => expect(staffCat.rename).toHaveBeenCalledWith("k1", 1, "Currencies"));
    expect(await screen.findByText(/Someone else changed this category/)).toBeTruthy();
  });

  it("explains why a category in use cannot be deleted, and deletes an empty one", async () => {
    staffCat.remove.mockRejectedValueOnce(
      Object.assign(appError("conflict"), {
        message: "This category has 4 courses. Move them to another category first.",
      }),
    );
    staffCat.remove.mockResolvedValue({ deleted: true });
    await renderRouter(app, { initialUrl: "/manage/categories" });
    await fireEvent.press(await screen.findByRole("button", { name: "Delete Forex" }));
    await press("Delete category");
    expect(await screen.findByText(/has 4 courses/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete Crypto" }));
    await press("Delete category");
    await waitFor(() => expect(staffCat.remove).toHaveBeenLastCalledWith("k2"));
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Category deleted"));
  });
});
