import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  createOrderRequestSchema,
  orderPageQuerySchema,
  paymentEventSchema,
  staffOrderQuerySchema,
  testCheckoutRequestSchema,
  type Order,
  type OrderPageQuery,
  type Page,
  type PaymentEventInput,
  type StaffOrder,
  type StaffOrderQuery,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import { Authenticated, CurrentUser, type AuthContext } from "../identity/index.js";
import { PaymentsService } from "./payments.service.js";

const idPipe = () => new ZodPipe(z.uuid());
const keyPipe = () =>
  new ZodPipe(
    z
      .string({ error: "Send an Idempotency-Key header" })
      .regex(
        /^[A-Za-z0-9_-]{8,100}$/,
        "Send an Idempotency-Key header of 8 to 100 letters, digits, - or _",
      ),
  );

@ApiTags("me")
@Controller("me/orders")
export class MyOrdersController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({
    summary: "Start or resume buying a course (test mode). Needs an Idempotency-Key header.",
  })
  @ApiZodBody(createOrderRequestSchema)
  @ApiErrors(400, 401, 404, 409)
  create(
    @CurrentUser() user: AuthContext,
    @Headers("idempotency-key") key: string | undefined,
    @Body(new ZodPipe(createOrderRequestSchema)) body: { courseId: string },
  ): Promise<Order> {
    return this.payments.createOrder(user.userId, body.courseId, keyPipe().transform(key));
  }

  @Get()
  @Authenticated()
  @ApiOperation({ summary: "Your purchases, newest first" })
  @ApiErrors(400, 401)
  list(
    @CurrentUser() user: AuthContext,
    @Query(new ZodPipe(orderPageQuerySchema)) q: OrderPageQuery,
  ): Promise<Page<Order>> {
    return this.payments.listMine(user.userId, q);
  }

  @Get(":orderId")
  @Authenticated()
  @ApiOperation({ summary: "One of your orders (to check a checkout after leaving the app)" })
  @ApiErrors(400, 401, 404)
  get(
    @CurrentUser() user: AuthContext,
    @Param("orderId", idPipe()) orderId: string,
  ): Promise<Order> {
    return this.payments.getMine(user.userId, orderId);
  }
}

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  /** Test provider only: the buyer chooses what the simulated checkout does. No money moves. */
  @Post("test/checkouts/:ref/complete")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "Finish a test checkout as paid, failed or cancelled (test mode only)" })
  @ApiZodBody(testCheckoutRequestSchema)
  @ApiErrors(400, 401, 403, 404)
  complete(
    @CurrentUser() user: AuthContext,
    @Param("ref", new ZodPipe(z.string().regex(/^test_cs_[0-9a-f-]{36}$/))) ref: string,
    @Body(new ZodPipe(testCheckoutRequestSchema))
    body: { outcome: "paid" | "failed" | "cancelled" },
  ): Promise<Order> {
    return this.payments.completeTestCheckout(user.userId, ref, body.outcome);
  }

  /** Provider events. The signature is the only authentication; repeats are harmless. */
  @Post("webhooks/:provider")
  @HttpCode(200)
  @ApiOperation({
    summary: "Signed provider events (the test provider signs with its webhook secret)",
  })
  @ApiZodBody(paymentEventSchema)
  @ApiErrors(400, 401)
  webhook(
    @Param("provider", new ZodPipe(z.string().regex(/^[a-z]{2,20}$/))) provider: string,
    @Headers("x-payment-signature") signature: string | undefined,
    @Body(new ZodPipe(paymentEventSchema)) body: PaymentEventInput,
  ): Promise<{ outcome: string }> {
    return this.payments.receiveWebhook(provider, body, signature);
  }
}

@ApiTags("staff")
@Controller("staff/orders")
export class StaffOrdersController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermission("payments:read_status")
  @ApiOperation({ summary: "Orders by status, newest first (no card or personal payment data)" })
  @ApiErrors(400)
  list(@Query(new ZodPipe(staffOrderQuerySchema)) q: StaffOrderQuery): Promise<Page<StaffOrder>> {
    return this.payments.listStaff(q);
  }
}
