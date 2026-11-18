import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  staffCourseApi: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
  },
  fetchAccess: jest.fn(),
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

const staff = staffCourseApi as unknown as Record<keyof typeof staffCourseApi, jest.Mock>;
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
const back = mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };

const STAFF = {
  roles: ["student", "manager"],
  permissions: ["course:create", "course:update", "course:publish"],
};
const STUDENT = { roles: ["student"], permissions: [] };

const course = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Price Action Basics",
  description: "Learn to read charts.",
  level: "beginner",
  priceCents: 4950,
  currency: "USD",
  coverTone: "blue",
  status: "draft",
  version: 1,
  publishedAt: null,
  createdAt: "2026-11-17T00:00:00.000Z",
  updatedAt: "2026-11-17T00:00:00.000Z",
  ...over,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  access.mockResolvedValue(STAFF);
  staff.list.mockResolvedValue(
    page([course(), course({ id: "c2", title: "Live Options", status: "published", version: 3 })]),
  );
});

describe("entry point and access", () => {
  it("shows Manage courses to staff only", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Manage courses" })).toBeTruthy();
    await screen.unmount();

    access.mockResolvedValue(STUDENT);
    const view = await renderRouter(app, { initialUrl: "/profile" });
    await view.findByText("Ann");
    expect(view.queryByRole("button", { name: "Manage courses" })).toBeNull();
  });

  it("shows an access-denied state to a student who opens the staff route directly, and never calls the staff list", async () => {
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/manage" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(staff.list).not.toHaveBeenCalled();
    await press("Back");
    expect(screen).toHavePathname("/home");
  });
});

describe("staff course list", () => {
  it("shows every course with its status as text, and filters by status", async () => {
    await renderRouter(app, { initialUrl: "/manage" });
    expect(await screen.findByTestId("staff-course-c1")).toBeTruthy();
    expect(screen.getByTestId("status-c1").props.children).toBe("Draft");
    expect(screen.getByTestId("status-c2").props.children).toBe("Published");
    expect(screen.getByLabelText("Price Action Basics, Draft, Beginner, $49.50")).toBeTruthy();
    expect(staff.list).toHaveBeenCalledWith({});

    staff.list.mockResolvedValue(page([course()]));
    await press("Drafts");
    await waitFor(() => expect(staff.list).toHaveBeenCalledWith({ status: "draft" }));
    expect(screen.getByRole("button", { name: "Drafts" }).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it("opens a course for editing and offers a new course", async () => {
    staff.get.mockResolvedValue(course());
    await renderRouter(app, { initialUrl: "/manage" });
    await screen.findByTestId("staff-course-c1");
    await press("New course");
    expect(screen).toHavePathname("/manage/new");
    await act(async () => router.back());
    await fireEvent.press(screen.getByTestId("staff-course-c1"));
    expect(screen).toHavePathname("/manage/c1");
  });

  it("shows loading, empty and error states with Retry", async () => {
    staff.list.mockResolvedValue(page([]));
    const first = await renderRouter(app, { initialUrl: "/manage" });
    expect(await first.findByText("No courses")).toBeTruthy();
    await first.unmount();

    staff.list.mockRejectedValueOnce(appError("forbidden")).mockResolvedValue(page([course()]));
    const second = await renderRouter(app, { initialUrl: "/manage" });
    expect(await second.findByTestId("state-error")).toBeTruthy();
    await fireEvent.press(second.getByRole("button", { name: "Retry" }));
    expect(await second.findByTestId("staff-course-c1")).toBeTruthy();
  });
});

describe("creating a course", () => {
  const open = () => renderRouter(app, { initialUrl: "/manage/new" });
  const fillValid = async () => {
    await screen.findByLabelText("Title");
    await type("Title", "Options Greeks");
    await type("Description", "How the Greeks work.");
    await type("Price in US dollars (0 for free)", "49.5");
  };

  it("saves a draft with the price in cents, the chosen level and cover, then returns to the list", async () => {
    staff.create.mockResolvedValue(course({ id: "c9" }));
    await open();
    await fillValid();
    await press("Advanced");
    await press("Black");
    await press("Create draft");
    expect(staff.create).toHaveBeenCalledWith({
      title: "Options Greeks",
      description: "How the Greeks work.",
      level: "advanced",
      priceCents: 4950,
      coverTone: "black",
      categoryId: null,
    });
    expect(screen).toHavePathname("/manage");
  });

  it("converts prices exactly and treats 0 as free", async () => {
    staff.create.mockResolvedValue(course());
    await open();
    await fillValid();
    await type("Price in US dollars (0 for free)", "0");
    await press("Create draft");
    expect(staff.create).toHaveBeenCalledWith(expect.objectContaining({ priceCents: 0 }));
  });

  it("shows validation beside the fields, keeps typed values and sends nothing", async () => {
    await open();
    await screen.findByLabelText("Title");
    await type("Title", "ab");
    await type("Price in US dollars (0 for free)", "49.555");
    await press("Create draft");
    expect(staff.create).not.toHaveBeenCalled();
    expect(screen.getByText("Use at least 3 characters")).toBeTruthy();
    expect(screen.getByText("Use at most two decimal places, for example 49.50.")).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("ab");
    expect(screen.getByLabelText("Price in US dollars (0 for free)").props.value).toBe("49.555");
  });

  it("rejects negative, lettered and over-limit prices", async () => {
    await open();
    await fillValid();
    for (const bad of ["-1", "abc", "10000.01"]) {
      await type("Price in US dollars (0 for free)", bad);
      await press("Create draft");
    }
    expect(staff.create).not.toHaveBeenCalled();
    expect(screen.getByText("The highest price is $10,000.00.")).toBeTruthy();
  });

  it("maps server field errors to the price field", async () => {
    staff.create.mockRejectedValue(
      appError("validation", { fields: [{ field: "priceCents", message: "Price is too high." }] }),
    );
    await open();
    await fillValid();
    await press("Create draft");
    expect(await screen.findByText("Price is too high.")).toBeTruthy();
  });

  it("sends one request when the button is pressed twice quickly", async () => {
    let finish!: () => void;
    staff.create.mockImplementation(() => new Promise((r) => (finish = () => r(course()))));
    await open();
    await fillValid();
    const b = screen.getByRole("button", { name: "Create draft" });
    await fireEvent.press(b);
    await fireEvent.press(b);
    expect(staff.create).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
});

describe("editing a course", () => {
  beforeEach(() => staff.get.mockResolvedValue(course()));
  const open = async () => {
    await renderRouter(app, { initialUrl: "/manage/c1" });
    await screen.findByDisplayValue("Price Action Basics");
  };

  it("loads the course, saves with the version it started from, and uses the new version next time", async () => {
    staff.update
      .mockResolvedValueOnce(course({ title: "Price Action Mastery", version: 2 }))
      .mockResolvedValueOnce(course({ title: "Final title", version: 3 }));
    await open();
    expect(screen.getByLabelText("Price in US dollars (0 for free)").props.value).toBe("49.50");
    await type("Title", "Price Action Mastery");
    await press("Save changes");
    expect(staff.update).toHaveBeenLastCalledWith(
      "c1",
      expect.objectContaining({
        title: "Price Action Mastery",
        expectedVersion: 1,
        priceCents: 4950,
      }),
    );
    expect(await screen.findByTestId("form-info")).toBeTruthy();
    await type("Title", "Final title");
    await press("Save changes");
    expect(staff.update).toHaveBeenLastCalledWith(
      "c1",
      expect.objectContaining({ expectedVersion: 2 }),
    );
  });

  it("explains a stale edit, keeps the typed text, and offers the latest version", async () => {
    staff.update
      .mockRejectedValueOnce(appError("conflict"))
      .mockResolvedValueOnce(course({ title: "My edit", version: 5 }));
    await open();
    await type("Title", "My edit");
    await press("Save changes");
    expect(await screen.findByTestId("stale-notice")).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("My edit");

    staff.get.mockResolvedValue(course({ version: 4, title: "Someone else's title" }));
    await press("Use latest version");
    expect(await screen.findByText(/Loaded the latest version \(4\)/)).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("My edit");
    await press("Save changes");
    expect(staff.update).toHaveBeenLastCalledWith(
      "c1",
      expect.objectContaining({ expectedVersion: 4, title: "My edit" }),
    );
  });

  it("shows server field errors beside the field", async () => {
    staff.update.mockRejectedValue(
      appError("validation", {
        fields: [{ field: "title", message: "That title is not allowed." }],
      }),
    );
    await open();
    await type("Title", "Something else");
    await press("Save changes");
    expect(await screen.findByText("That title is not allowed.")).toBeTruthy();
  });
});

describe("publishing", () => {
  const open = async (c = course()) => {
    staff.get.mockResolvedValue(c);
    await renderRouter(app, { initialUrl: `/manage/${c.id}` });
    await screen.findByDisplayValue(c.title as string);
  };

  it("publishes after a confirmation that says what students will see", async () => {
    staff.publish.mockResolvedValue(course({ status: "published", version: 2 }));
    await open();
    expect(screen.getByTestId("course-status").props.children.join("")).toContain("Draft");
    await press("Publish course");
    expect(
      screen.getByText(/Students will be able to see and open this course/, hidden),
    ).toBeTruthy();
    expect(staff.publish).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Publish", ...hidden }));
    expect(staff.publish).toHaveBeenCalledWith("c1");
    await waitFor(() =>
      expect(screen.getByTestId("course-status").props.children.join("")).toContain("Published"),
    );
    expect(screen.getByRole("button", { name: "Unpublish course" })).toBeTruthy();
  });

  it("does nothing when the confirmation is cancelled or closed with back", async () => {
    await open();
    await press("Publish course");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel", ...hidden }));
    await press("Publish course");
    await act(async () => {
      back.pressBack();
    });
    expect(staff.publish).not.toHaveBeenCalled();
    expect(screen.queryByText(/see and open this course/, hidden)).toBeNull();
  });

  it("unpublishes after confirming", async () => {
    staff.unpublish.mockResolvedValue(course({ status: "draft", version: 3 }));
    await open(course({ status: "published", version: 2 }));
    await press("Unpublish course");
    expect(screen.getByText(/no longer see this course/, hidden)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Unpublish", ...hidden }));
    expect(staff.unpublish).toHaveBeenCalledWith("c1");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Publish course" })).toBeTruthy(),
    );
  });

  it("shows an incomplete-draft refusal beside the field and keeps the draft", async () => {
    staff.publish.mockRejectedValue(
      appError("validation", {
        fields: [{ field: "description", message: "Add a description before publishing." }],
      }),
    );
    await open(course({ description: "" }));
    await press("Publish course");
    await fireEvent.press(screen.getByRole("button", { name: "Publish", ...hidden }));
    expect(await screen.findByText("Add a description before publishing.")).toBeTruthy();
    expect(screen.getByTestId("form-error").props.accessibilityLabel).toMatch(
      /Fix the highlighted fields/,
    );
    expect(screen.getByTestId("course-status").props.children.join("")).toContain("Draft");
  });

  it("asks to save first when there are unsaved changes", async () => {
    await open();
    await type("Title", "Changed but not saved");
    expect(
      screen.getByRole("button", { name: "Publish course" }).props.accessibilityState.disabled,
    ).toBe(true);
    expect(screen.getByText(/Save your changes before publishing/)).toBeTruthy();
  });
});
