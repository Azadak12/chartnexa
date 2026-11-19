import { Module } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { AccessModule } from "../access/index.js";
import { IdentityModule } from "../identity/index.js";
import {
  MyOrdersController,
  PaymentsController,
  StaffOrdersController,
} from "./payments.controller.js";
import { PAYMENT_PROVIDER, TestPaymentProvider } from "./payment-provider.js";
import { PaymentsService } from "./payments.service.js";

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [MyOrdersController, PaymentsController, StaffOrdersController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (c: AppConfig) => new TestPaymentProvider(c.PAYMENT_TEST_WEBHOOK_SECRET),
      inject: [CONFIG],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
