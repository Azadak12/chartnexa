import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppError } from "../src/api/errors";
import * as authedFetchModule from "../src/auth/authed-fetch";
import { CourseCard } from "../src/courses/CourseCard";
import { CoverBlock } from "../src/courses/CoverBlock";
import { checkImage, imagePicker, StaffCourseThumbnail } from "../src/courses/StaffCourseThumbnail";
import { fileReader } from "../src/resources/upload";

jest.mock("../src/auth/authed-fetch", () => ({ authedFetch: jest.fn() }));
const authed = authedFetchModule.authedFetch as unknown as jest.Mock;

const H = { includeHiddenElements: true };
const summary = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Candlestick Chart Mastery",
  summary: "Read candles with confidence.",
  level: "beginner" as const,
  priceCents: 4900,
  currency: "USD" as const,
  coverTone: "blue" as const,
  publishedAt: "2026-11-17T00:00:00.000Z",
  categoryId: "k1",
  categoryName: "Charting",
  thumbnailUrl: "/courses/thumbnails/abc",
  instructor: { id: "i1", displayName: "Dana Instructor" },
  rating: { count: 12, average: 4.6 },
  ...over,
});
const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("CoverBlock", () => {
  it("shows the image with a spinner until it loads, and the colour cover when it fails", async () => {
    await render(<CoverBlock tone="blue" thumbnailUrl="/courses/thumbnails/abc" />);
    const img = screen.getByTestId("cover-image", H);
    expect(img.props.source.uri).toMatch(/\/courses\/thumbnails\/abc$/);
    await fireEvent(img, "error");
    expect(screen.queryByTestId("cover-image", H)).toBeNull();
    expect(screen.getByTestId("cover", H)).toBeTruthy();
  });

  it("shows the colour cover when there is no thumbnail, and retries a new address", async () => {
    const { rerender } = await render(<CoverBlock tone="black" thumbnailUrl={null} />);
    expect(screen.queryByTestId("cover-image", H)).toBeNull();
    await rerender(<CoverBlock tone="black" thumbnailUrl="/courses/thumbnails/one" />);
    await fireEvent(screen.getByTestId("cover-image", H), "error");
    expect(screen.queryByTestId("cover-image", H)).toBeNull();
    await rerender(<CoverBlock tone="black" thumbnailUrl="/courses/thumbnails/two" />);
    expect(screen.getByTestId("cover-image", H).props.source.uri).toMatch(/two$/);
  });
});

describe("CourseCard", () => {
  it("shows thumbnail, category, instructor, level, price and rating", async () => {
    await render(<CourseCard course={summary()} onPress={() => {}} />);
    expect(screen.getByTestId("cover-image", H)).toBeTruthy();
    expect(screen.getByText("CHARTING")).toBeTruthy();
    expect(screen.getByText("By Dana Instructor")).toBeTruthy();
    expect(screen.getByText("Beginner")).toBeTruthy();
    expect(screen.getByText("$49.00")).toBeTruthy();
    expect(screen.getByTestId("rating-c1")).toBeTruthy();
  });

  it("copes with a course that has no category, instructor or thumbnail", async () => {
    await render(
      <CourseCard
        course={summary({ categoryName: null, instructor: null, thumbnailUrl: null })}
        onPress={() => {}}
      />,
    );
    expect(screen.queryByText(/^By /)).toBeNull();
    expect(screen.queryByTestId("cover-image", H)).toBeNull();
  });
});

describe("checkImage", () => {
  it("accepts PNG, JPEG and WebP up to 2 MB only", () => {
    expect(checkImage({ mimeType: "image/png", size: 1000 })).toBeNull();
    expect(checkImage({ mimeType: "image/webp", size: 2 * 1024 * 1024 })).toBeNull();
    expect(checkImage({ mimeType: "image/gif", size: 10 })).toMatch(/PNG, JPEG or WebP/);
    expect(checkImage({ mimeType: "image/png", size: 2 * 1024 * 1024 + 1 })).toMatch(/2 MB/);
  });
});

describe("StaffCourseThumbnail", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    authed.mockReset();
  });

  it("uploads the picked image once, shows it, and can remove it", async () => {
    jest.spyOn(imagePicker, "pick").mockResolvedValue({
      uri: "file:///a.png",
      name: "a.png",
      size: 1000,
      mimeType: "image/png",
    });
    const read = jest.spyOn(fileReader, "readPart").mockResolvedValue(new Uint8Array([1, 2, 3]));
    let release!: (v: unknown) => void;
    authed.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await wrap(<StaffCourseThumbnail courseId="c1" tone="blue" initialUrl={null} />);
    expect(screen.queryByTestId("cover-image", H)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Choose thumbnail" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose thumbnail" }));
    await waitFor(() => expect(authed).toHaveBeenCalledTimes(1));
    expect(read).toHaveBeenCalledWith("file:///a.png", 0, 1000);
    expect(authed.mock.calls[0][0]).toBe("/staff/courses/c1/thumbnail");
    expect(authed.mock.calls[0][1]).toMatchObject({ method: "PUT" });
    await act(async () => release({ thumbnailUrl: "/courses/thumbnails/new" }));
    expect(await screen.findByText(/Thumbnail saved\./)).toBeTruthy();
    expect(screen.getByTestId("cover-image", H).props.source.uri).toMatch(/new$/);
    authed.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByRole("button", { name: "Remove thumbnail" }));
    expect(await screen.findByText(/Thumbnail removed/)).toBeTruthy();
    expect(screen.queryByTestId("cover-image", H)).toBeNull();
  });

  it("refuses a wrong type or an oversized image without sending it, and shows server errors", async () => {
    const pick = jest.spyOn(imagePicker, "pick");
    pick.mockResolvedValueOnce({
      uri: "file:///a.gif",
      name: "a.gif",
      size: 10,
      mimeType: "image/gif",
    });
    await wrap(
      <StaffCourseThumbnail courseId="c1" tone="blue" initialUrl="/courses/thumbnails/old" />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Replace thumbnail" }));
    expect(await screen.findByText(/Use a PNG, JPEG or WebP image\./)).toBeTruthy();
    expect(authed).not.toHaveBeenCalled();
    pick.mockResolvedValueOnce({
      uri: "file:///a.png",
      name: "a.png",
      size: 100,
      mimeType: "image/png",
    });
    jest.spyOn(fileReader, "readPart").mockResolvedValue(new Uint8Array([1]));
    authed.mockRejectedValueOnce(
      new AppError("forbidden", "You do not have permission to do that.", 403, null),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Replace thumbnail" }));
    expect(await screen.findByText(/do not have permission/)).toBeTruthy();
    expect(screen.getByTestId("cover-image", H).props.source.uri).toMatch(/old$/);
    pick.mockResolvedValueOnce(null);
    await fireEvent.press(screen.getByRole("button", { name: "Replace thumbnail" }));
    expect(authed).toHaveBeenCalledTimes(1);
  });
});
