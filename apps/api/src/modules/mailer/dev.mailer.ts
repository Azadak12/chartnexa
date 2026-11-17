import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type MailMessage, type Mailer, render } from "./mailer.js";

/**
 * Development only: writes each email to a git-ignored directory so tokens never reach
 * structured logs. Rejected at startup in production.
 */
export class DevMailer implements Mailer {
  constructor(
    private readonly dir: string,
    private readonly linkBase: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const { subject, text } = render(message, this.linkBase);
    const file = join(this.dir, `${Date.now()}-${randomUUID()}.txt`);
    await writeFile(file, `To: ${message.to}\nSubject: ${subject}\n\n${text}`, "utf8");
  }
}
