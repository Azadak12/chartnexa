import { describe, expect, it, vi } from "vitest";
import { ResendMailer } from "./resend.mailer.js";

const msg = { to: "a@b.co", template: "instructor_invitation", data: { token: "TOK" } } as const;

describe("ResendMailer", () => {
  it("posts the rendered message with the key as a bearer token", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    await new ResendMailer("KEY", "CN <x@y.co>", "chartnexa://", f as never).send(msg);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer KEY");
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(["a@b.co"]);
    expect(body.from).toBe("CN <x@y.co>");
    expect(body.text).toContain("TOK");
  });

  it("fails with the status only, never the key or token", async () => {
    const f = vi.fn(async () => new Response("secret TOK", { status: 403 }));
    const err = (await new ResendMailer("KEY", "x@y.co", "chartnexa://", f as never)
      .send(msg)
      .catch((e: Error) => e)) as Error;
    expect(String(err.message)).toBe("Email service refused the message (status 403)");
    expect(String(err.message)).not.toMatch(/KEY|TOK/);
  });
});
