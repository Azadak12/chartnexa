import { Global, Module } from "@nestjs/common";
import { join } from "node:path";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { DevMailer } from "./dev.mailer.js";
import { MAILER, type Mailer } from "./mailer.js";
import { ResendMailer } from "./resend.mailer.js";
import { MemoryMailer } from "./memory.mailer.js";

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [CONFIG],
      useFactory: (config: AppConfig): Mailer =>
        config.MAILER_DRIVER === "memory"
          ? new MemoryMailer()
          : config.MAILER_DRIVER === "resend"
            ? new ResendMailer(
                config.RESEND_API_KEY ?? "",
                config.MAIL_FROM ?? "",
                config.APP_LINK_BASE,
              )
            : new DevMailer(join(process.cwd(), ".dev-mail"), config.APP_LINK_BASE),
    },
  ],
  exports: [MAILER],
})
export class MailerModule {}
