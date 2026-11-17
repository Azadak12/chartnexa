export const MAILER = Symbol("MAILER");

export type MailTemplate = "verify_email" | "password_reset" | "registration_attempt";

export interface MailMessage {
  to: string;
  template: MailTemplate;
  /** Template data, for example { token }. Never logged. */
  data: Record<string, string>;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function render(message: MailMessage, linkBase: string): { subject: string; text: string } {
  const link = (path: string, token: string | undefined): string =>
    `${linkBase.replace(/\/*$/, "/")}${path}?token=${encodeURIComponent(token ?? "")}`;
  switch (message.template) {
    case "verify_email":
      return {
        subject: "Verify your ChartNexa email",
        text: `Confirm your email address:\n${link("verify-email", message.data["token"])}\n\nThis link expires in 24 hours. If you did not sign up, ignore this email.\n`,
      };
    case "password_reset":
      return {
        subject: "Reset your ChartNexa password",
        text: `Reset your password:\n${link("reset-password", message.data["token"])}\n\nThis link expires in 30 minutes. If you did not ask for this, ignore this email.\n`,
      };
    case "registration_attempt":
      return {
        subject: "Someone tried to register with your email",
        text: "Someone tried to create a ChartNexa account with your email address. You already have an account. If this was you, sign in or reset your password. Otherwise no action is needed.\n",
      };
  }
}
