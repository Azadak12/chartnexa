import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { GRANTABLE_LIST } from "@chartnexa/api-contracts";
import * as focus from "../src/ui/focus";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { PERMISSION_LABEL } from "../src/instructors/labels";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  staffCourseApi: { list: jest.fn(), get: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/instructors/instructor-api", () => ({
  instructorApi: {
    lookup: jest.fn(),
    permissions: jest.fn(),
    grant: jest.fn(),
    revokeGrant: jest.fn(),
    makeInstructor: jest.fn(),
    removeInstructorRole: jest.fn(),
  },
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

const api = instructorApi as unknown as Record<keyof typeof instructorApi, jest.Mock>;
const courses = staffCourseApi as unknown as Record<"list" | "get", jest.Mock>;
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };

const ADMIN = {
  roles: ["student", "admin"],
  permissions: ["instructor_permissions:manage", "course:update"],
  courseGrants: [],
};
const MANAGER = { ...ADMIN, roles: ["student", "manager"] };
const INSTRUCTOR = { roles: ["student", "instructor"], permissions: [], courseGrants: [] };
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };

const grantable = (publishAllowed: boolean) =>
  GRANTABLE_LIST.map((permission) => ({
    permission,
    scope: permission === "course:create" ? "academy" : "course",
    allowedForYou: permission === "course:publish" ? publishAllowed : true,
  }));
const grant = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  permission: "course:update",
  courseId: "c1",
  courseTitle: "Price Action Basics",
  source: "manual",
  reason: "Teaches it",
  grantedAt: "2026-11-18T00:00:00.000Z",
  ...over,
});
const perms = (grants: unknown[] = [grant()], publishAllowed = false) => ({
  userId: "i1",
  displayName: "Ira Instructor",
  grants,
  grantable: grantable(publishAllowed),
});
const found = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  displayName: "Ira Instructor",
  staffRole: "instructor",
  status: "active",
  ...over,
});
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label, hidden), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name, ...hidden }));
const course = (id: string, title: string) => ({
  id,
  title,
  description: "d",
  level: "beginner",
  priceCents: 0,
  currency: "USD",
  coverTone: "blue",
  status: "draft",
  version: 1,
  publishedAt: null,
  createdAt: "2026-11-17T00:00:00.000Z",
  updatedAt: "2026-11-17T00:00:00.000Z",
});

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  access.mockResolvedValue(ADMIN);
  api.lookup.mockResolvedValue(found());
  api.permissions.mockResolvedValue(perms());
  api.grant.mockResolvedValue({ grant: grant(), created: true });
  api.revokeGrant.mockResolvedValue(undefined);
  api.makeInstructor.mockResolvedValue({ userId: "i1", staffRole: "instructor" });
  api.removeInstructorRole.mockResolvedValue({ userId: "i1", staffRole: null });
  courses.list.mockResolvedValue({
    items: [course("c1", "Price Action Basics"), course("c2", "Live Options")],
    nextCursor: null,
  });
});

const openSearch = () => renderRouter(app, { initialUrl: "/profile/instructors" });
const findPerson = async (email = "ira@example.com") => {
  await screen.findByLabelText("Email");
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.press(screen.getByRole("button", { name: "Find" }));
};

describe("entry point and access", () => {
  it("shows the entry to Admins and Managers only", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Instructor permissions" })).toBeTruthy();
    await screen.unmount();
    access.mockResolvedValue(MANAGER);
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Instructor permissions" })).toBeTruthy();
    await screen.unmount();
    for (const who of [INSTRUCTOR, STUDENT]) {
      access.mockResolvedValue(who);
      const view = await renderRouter(app, { initialUrl: "/profile" });
      await view.findByText("Ann");
      expect(view.queryByRole("button", { name: "Instructor permissions" })).toBeNull();
      await view.unmount();
    }
  });

  it("shows access denied on the routes for Instructors and Students and calls nothing", async () => {
    for (const who of [INSTRUCTOR, STUDENT]) {
      access.mockResolvedValue(who);
      await openSearch();
      expect(await screen.findByText("You do not have access")).toBeTruthy();
      await screen.unmount();
      await renderRouter(app, { initialUrl: "/profile/instructors/i1" });
      expect(await screen.findByText("You do not have access")).toBeTruthy();
      await screen.unmount();
    }
    expect(api.lookup).not.toHaveBeenCalled();
    expect(api.permissions).not.toHaveBeenCalled();
  });
});

describe("finding a person", () => {
  it("looks up a trimmed, lower-cased email and opens a found Instructor's permissions", async () => {
    await openSearch();
    await findPerson("  Ira@Example.com ");
    expect(await screen.findByTestId("person-role")).toBeTruthy();
    expect(api.lookup).toHaveBeenCalledWith("ira@example.com");
    expect(screen.getByText("Ira Instructor")).toBeTruthy();
    await press("Open permissions");
    expect(screen).toHavePathname("/profile/instructors/i1");
    expect(await screen.findByText("Edit course details")).toBeTruthy();
  });

  it("says when the person is not an Instructor, and offers Make Instructor to Admins only", async () => {
    api.lookup.mockResolvedValue(found({ staffRole: null }));
    await openSearch();
    await findPerson();
    expect(await screen.findByTestId("not-instructor")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make Instructor" })).toBeTruthy();
    await screen.unmount();

    access.mockResolvedValue(MANAGER);
    await openSearch();
    await findPerson();
    await screen.findByTestId("not-instructor");
    expect(screen.queryByRole("button", { name: "Make Instructor" })).toBeNull();
  });

  it("shows plain messages beside the field for a malformed email or no match, and keeps the text", async () => {
    await openSearch();
    await findPerson("nope");
    expect(await screen.findByText(/Enter a full email address/)).toBeTruthy();
    expect(api.lookup).not.toHaveBeenCalled();
    api.lookup.mockRejectedValue(appError("not_found"));
    await findPerson("ghost@example.com");
    expect(await screen.findByText("No account matches that email.")).toBeTruthy();
    expect(screen.getByLabelText("Email").props.value).toBe("ghost@example.com");
  });

  it("shows an error with Retry when the lookup fails", async () => {
    api.lookup.mockRejectedValueOnce(appError("network")).mockResolvedValue(found());
    await openSearch();
    await findPerson();
    expect(await screen.findByTestId("lookup-error")).toBeTruthy();
    await press("Retry");
    expect(await screen.findByTestId("person-role")).toBeTruthy();
  });

  it("appoints an Instructor with a reason and shows the result", async () => {
    api.lookup.mockResolvedValue(found({ staffRole: null }));
    await openSearch();
    await findPerson();
    await screen.findByTestId("not-instructor");
    await press("Make Instructor");
    await act(async () =>
      fireEvent.press(
        screen.getAllByRole("button", { name: "Make Instructor", ...hidden }).at(-1)!,
      ),
    );
    expect(api.makeInstructor).not.toHaveBeenCalled();
    expect(await screen.findByText("Write 3 to 200 characters", hidden)).toBeTruthy();
    await type("Reason", "Joins the team");
    await act(async () =>
      fireEvent.press(
        screen.getAllByRole("button", { name: "Make Instructor", ...hidden }).at(-1)!,
      ),
    );
    await waitFor(() => expect(api.makeInstructor).toHaveBeenCalledWith("i1", "Joins the team"));
    expect(await screen.findByTestId("search-notice")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open permissions" })).toBeTruthy();
  });

  it("explains a refusal without changing anything and keeps the reason", async () => {
    api.lookup.mockResolvedValue(found({ staffRole: null }));
    api.makeInstructor.mockRejectedValue(appError("forbidden"));
    await openSearch();
    await findPerson();
    await screen.findByTestId("not-instructor");
    await press("Make Instructor");
    await type("Reason", "Joins the team");
    await act(async () =>
      fireEvent.press(
        screen.getAllByRole("button", { name: "Make Instructor", ...hidden }).at(-1)!,
      ),
    );
    expect(await screen.findByTestId("reason-error", hidden)).toBeTruthy();
    expect(screen.getByLabelText("Reason", hidden).props.value).toBe("Joins the team");
    expect(screen.queryByTestId("search-notice")).toBeNull();
  });
});

describe("the person page", () => {
  const open = () => renderRouter(app, { initialUrl: "/profile/instructors/i1" });

  it("lists grants in words with their course, and a friendly empty state", async () => {
    await open();
    expect(await screen.findByText("Edit course details")).toBeTruthy();
    expect(screen.getByText("Course: Price Action Basics")).toBeTruthy();
    expect(
      screen.getByLabelText("Remove Edit course details for Price Action Basics"),
    ).toBeTruthy();
    await screen.unmount();
    api.permissions.mockResolvedValue(perms([]));
    await open();
    expect(await screen.findByTestId("no-grants")).toBeTruthy();
  });

  it("shows loading, a not-an-Instructor state and an error with Retry", async () => {
    api.permissions.mockRejectedValueOnce(appError("not_found"));
    await open();
    expect(await screen.findByText("Not an Instructor")).toBeTruthy();
    await screen.unmount();
    api.permissions.mockRejectedValueOnce(appError("network")).mockResolvedValue(perms());
    await open();
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    await press("Retry");
    expect(await screen.findByText("Edit course details")).toBeTruthy();
  });

  it("adds a course permission after choosing the course and giving a reason", async () => {
    api.permissions.mockResolvedValueOnce(perms([])).mockResolvedValue(perms());
    await open();
    await screen.findByTestId("no-grants");
    await press("Add permission");
    await press("Edit course details");
    expect(await screen.findByText("Live Options", hidden)).toBeTruthy();
    await press("Live Options");
    await type("Reason", "Teaches this course");
    await act(async () =>
      fireEvent.press(screen.getAllByRole("button", { name: "Add permission", ...hidden }).at(-1)!),
    );
    await waitFor(() =>
      expect(api.grant).toHaveBeenCalledWith("i1", {
        permission: "course:update",
        courseId: "c2",
        reason: "Teaches this course",
      }),
    );
    expect(await screen.findByTestId("person-notice")).toBeTruthy();
    expect(await screen.findByText("Course: Price Action Basics")).toBeTruthy();
  });

  it("adds the academy-wide create permission without asking for a course", async () => {
    await open();
    await screen.findByText("Edit course details");
    await press("Add permission");
    await press("Create new courses");
    expect(screen.queryByText("Which course?", hidden)).toBeNull();
    await type("Reason", "Trusted author");
    await act(async () =>
      fireEvent.press(screen.getAllByRole("button", { name: "Add permission", ...hidden }).at(-1)!),
    );
    await waitFor(() =>
      expect(api.grant).toHaveBeenCalledWith("i1", {
        permission: "course:create",
        reason: "Trusted author",
      }),
    );
  });

  it("shows field errors and sends nothing when the permission, course or reason is missing", async () => {
    await open();
    await screen.findByText("Edit course details");
    await press("Add permission");
    await act(async () =>
      fireEvent.press(screen.getAllByRole("button", { name: "Add permission", ...hidden }).at(-1)!),
    );
    expect(await screen.findByText("Choose a permission", hidden)).toBeTruthy();
    await press("Edit course details");
    await act(async () =>
      fireEvent.press(screen.getAllByRole("button", { name: "Add permission", ...hidden }).at(-1)!),
    );
    expect(await screen.findByText("Choose a course", hidden)).toBeTruthy();
    expect(screen.getAllByText("Write 3 to 200 characters", hidden).length).toBeGreaterThan(0);
    expect(api.grant).not.toHaveBeenCalled();
  });

  it("dims Publish for a Manager with an explanation, and cannot choose it", async () => {
    access.mockResolvedValue(MANAGER);
    await open();
    await screen.findByText("Edit course details");
    await press("Add permission");
    expect(screen.getByTestId("ceiling-note", hidden)).toBeTruthy();
    const publish = screen.getByRole("button", {
      name: "Publish and unpublish courses",
      ...hidden,
    });
    expect(publish.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(publish);
    expect(publish.props.accessibilityState.selected).toBe(false);
  });

  it("lets an Admin choose Publish", async () => {
    api.permissions.mockResolvedValue(perms([], true));
    await open();
    await screen.findByTestId("no-grants");
    await press("Add permission");
    const publish = screen.getByRole("button", {
      name: "Publish and unpublish courses",
      ...hidden,
    });
    expect(publish.props.accessibilityState.disabled).toBe(false);
  });

  it("keeps the typed reason and shows the server message when adding fails", async () => {
    api.grant.mockRejectedValue(appError("forbidden"));
    await open();
    await screen.findByText("Edit course details");
    await press("Add permission");
    await press("Create new courses");
    await type("Reason", "Trusted author");
    await act(async () =>
      fireEvent.press(screen.getAllByRole("button", { name: "Add permission", ...hidden }).at(-1)!),
    );
    expect(await screen.findByTestId("add-error", hidden)).toBeTruthy();
    expect(screen.getByLabelText("Reason", hidden).props.value).toBe("Trusted author");
  });

  it("removes a permission with a reason and refreshes the list", async () => {
    api.permissions.mockResolvedValueOnce(perms()).mockResolvedValue(perms([]));
    await open();
    await screen.findByText("Edit course details");
    await press("Remove Edit course details for Price Action Basics");
    await type("Reason", "No longer teaching");
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: "Remove", ...hidden })),
    );
    await waitFor(() =>
      expect(api.revokeGrant).toHaveBeenCalledWith("i1", "g1", "No longer teaching"),
    );
    expect(await screen.findByTestId("no-grants")).toBeTruthy();
    expect(screen.getByTestId("person-notice")).toBeTruthy();
  });

  it("changes nothing on Cancel, and sends one request for a double tap", async () => {
    await open();
    await screen.findByText("Edit course details");
    await press("Remove Edit course details for Price Action Basics");
    await press("Cancel");
    expect(api.revokeGrant).not.toHaveBeenCalled();
    expect(screen.getByText("Edit course details")).toBeTruthy();

    let release: () => void = () => {};
    api.revokeGrant.mockImplementation(() => new Promise<void>((r) => (release = r)));
    await press("Remove Edit course details for Price Action Basics");
    await type("Reason", "No longer teaching");
    const confirm = screen.getByRole("button", { name: "Remove", ...hidden });
    await fireEvent.press(confirm);
    await fireEvent.press(confirm);
    await act(async () => release());
    expect(api.revokeGrant).toHaveBeenCalledTimes(1);
  });

  it("shows a refusal when removing fails with 404 or 403, and keeps the reason", async () => {
    api.revokeGrant.mockRejectedValue(appError("not_found"));
    await open();
    await screen.findByText("Edit course details");
    await press("Remove Edit course details for Price Action Basics");
    await type("Reason", "No longer teaching");
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: "Remove", ...hidden })),
    );
    expect(await screen.findByTestId("reason-error", hidden)).toBeTruthy();
    expect(screen.getByLabelText("Reason", hidden).props.value).toBe("No longer teaching");
  });

  it("ends the Instructor role for Admins only, then goes back", async () => {
    await open();
    await screen.findByText("Edit course details");
    await press("Remove Instructor role");
    await type("Reason", "Left the team");
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: "Remove role", ...hidden })),
    );
    await waitFor(() =>
      expect(api.removeInstructorRole).toHaveBeenCalledWith("i1", "Left the team"),
    );
    await screen.unmount();

    access.mockResolvedValue(MANAGER);
    await open();
    await screen.findByText("Edit course details");
    expect(screen.queryByRole("button", { name: "Remove Instructor role" })).toBeNull();
  });
});

describe("accessibility", () => {
  it("returns focus to the opening control when a sheet closes", async () => {
    const spy = jest.spyOn(focus, "focusElement").mockImplementation(() => undefined);
    await renderRouter(app, { initialUrl: "/profile/instructors/i1" });
    await screen.findByText("Edit course details");
    await press("Add permission");
    spy.mockClear();
    await press("Cancel");
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    await press("Remove Edit course details for Price Action Basics");
    await press("Cancel");
    spy.mockRestore();
  });

  it("gives every control a text name and an announced success message", async () => {
    await renderRouter(app, { initialUrl: "/profile/instructors/i1" });
    await screen.findByText("Edit course details");
    for (const name of ["Add permission", "Remove Instructor role", "Back"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByRole("header", { name: "Ira Instructor" })).toBeTruthy();
  });
});

describe("labels", () => {
  it("has a plain-language label for every grantable permission", () => {
    for (const p of GRANTABLE_LIST) expect(PERMISSION_LABEL[p]).toBeTruthy();
    expect(Object.keys(PERMISSION_LABEL).sort()).toEqual([...GRANTABLE_LIST].sort());
  });
});
