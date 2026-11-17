import type { MailMessage, Mailer } from "./mailer.js";

/** Captures messages for tests. */
export class MemoryMailer implements Mailer {
  readonly outbox: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    return Promise.resolve();
  }

  last(to: string, template?: MailMessage["template"]): MailMessage | undefined {
    return [...this.outbox]
      .reverse()
      .find((m) => m.to === to && (!template || m.template === template));
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
