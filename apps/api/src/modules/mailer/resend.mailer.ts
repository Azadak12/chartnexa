import { type MailMessage, type Mailer, render } from "./mailer.js";

/**
 * Sends real email through Resend's HTTPS API. The API key and the message are never logged;
 * failures say only the status, so a token in the body cannot reach logs.
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly linkBase: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const { subject, text } = render(message, this.linkBase);
    const res = await this.doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Email service refused the message (status ${res.status})`);
  }
}
