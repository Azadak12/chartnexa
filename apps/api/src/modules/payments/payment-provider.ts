import { ServiceUnavailableException } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * A payment provider (card checkout, Apple or Google billing). The strategy is pending (ADR-0008,
 * Q02); every provider feeds the same orders, events and entitlements (ADR-0006).
 */
export interface PaymentProvider {
  readonly name: string;
  readonly testMode: boolean;
  /** Opens a checkout for an order and returns the provider's reference for it. */
  createCheckout(orderId: string, amountCents: number): Promise<{ ref: string }>;
  /** True when a webhook body was really sent by the provider. */
  verifySignature(body: string, signature: string | undefined): boolean;
}
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

/**
 * Test provider: no money moves. Checkouts are references the app completes through the test
 * endpoint, which sends a signed event through the same webhook handling as a real provider.
 * Production configuration refuses it.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly name = "test";
  readonly testMode = true;
  constructor(private readonly secret: string) {}

  async createCheckout(): Promise<{ ref: string }> {
    return { ref: `test_cs_${randomUUID()}` };
  }

  sign(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("hex");
  }

  verifySignature(body: string, signature: string | undefined): boolean {
    if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
    return timingSafeEqual(Buffer.from(this.sign(body), "hex"), Buffer.from(signature, "hex"));
  }
}

/**
 * Hosted pilot: no payment provider is connected, so nobody can buy. The academy gives students
 * access to courses itself (Students and access). Every checkout is refused and no webhook can
 * be valid.
 */
export class DisabledPaymentProvider implements PaymentProvider {
  readonly name = "disabled";
  readonly testMode = false;

  async createCheckout(): Promise<{ ref: string }> {
    throw new ServiceUnavailableException(
      "Purchases are not available yet. Ask the academy to give you access.",
    );
  }

  verifySignature(): boolean {
    return false;
  }
}
