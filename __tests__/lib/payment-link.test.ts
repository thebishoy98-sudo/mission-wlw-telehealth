/** @jest-environment node */

import {
  assessPaymentRetryEligibility,
  buildPaymentLinkUrl,
  createPaymentLinkToken,
  verifyPaymentLinkToken,
} from "@/lib/payment-link";
import type { Order, Payment } from "@/types";

const env = { PAYMENT_LINK_SECRET: "test-secret" };

describe("payment link tokens", () => {
  it("round-trips a valid token", () => {
    const { token, expiresAt } = createPaymentLinkToken("order_123", { env, now: 1_000_000 });
    const result = verifyPaymentLinkToken(token, { env, now: 1_000_001 });
    expect(result).toEqual({ valid: true, orderId: "order_123", expiresAt });
  });

  it("rejects expired tokens", () => {
    const { token } = createPaymentLinkToken("order_123", { env, now: 1_000_000, ttlMs: 60_000 });
    const result = verifyPaymentLinkToken(token, { env, now: 1_000_000 + 60_001 });
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("rejects tampered payloads", () => {
    const { token } = createPaymentLinkToken("order_123", { env });
    const [, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ v: "v1", o: "order_other", e: Date.now() + 60_000 })).toString("base64url");
    const result = verifyPaymentLinkToken(`${forgedPayload}.${signature}`, { env });
    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects tokens signed with a different secret", () => {
    const { token } = createPaymentLinkToken("order_123", { env: { PAYMENT_LINK_SECRET: "other-secret" } });
    const result = verifyPaymentLinkToken(token, { env });
    expect(result).toEqual({ valid: false, reason: "bad_signature" });
  });

  it("rejects malformed tokens", () => {
    expect(verifyPaymentLinkToken("", { env })).toEqual({ valid: false, reason: "malformed" });
    expect(verifyPaymentLinkToken("just-one-part", { env })).toEqual({ valid: false, reason: "malformed" });
    expect(verifyPaymentLinkToken("a.b.c", { env })).toEqual({ valid: false, reason: "malformed" });
  });

  it("falls back to ADMIN_SECRET and fails without any secret", () => {
    const { token } = createPaymentLinkToken("order_123", { env: { ADMIN_SECRET: "admin-secret" } });
    expect(verifyPaymentLinkToken(token, { env: { ADMIN_SECRET: "admin-secret" } }).valid).toBe(true);
    expect(() => createPaymentLinkToken("order_123", { env: {} })).toThrow(/must be configured/);
  });

  it("builds the pay-only page URL", () => {
    expect(buildPaymentLinkUrl("https://example.com/", "abc.def")).toBe("https://example.com/pay/order/abc.def");
  });
});

describe("payment retry eligibility", () => {
  const order = (overrides: Partial<Order>) =>
    ({ status: "cancelled", paymentStatus: "failed", ...overrides }) as Order;
  const payment = (status: Payment["status"]) => ({ status }) as Payment;

  it("allows failed, pending, and cancelled unpaid orders", () => {
    expect(assessPaymentRetryEligibility({ order: order({ paymentStatus: "failed" }) })).toEqual({ eligible: true });
    expect(assessPaymentRetryEligibility({ order: order({ paymentStatus: "pending", status: "draft" }) })).toEqual({ eligible: true });
    expect(
      assessPaymentRetryEligibility({ order: order({ status: "cancelled" }), payment: payment("failed") })
    ).toEqual({ eligible: true });
  });

  it("rejects orders whose paymentStatus is completed", () => {
    expect(assessPaymentRetryEligibility({ order: order({ paymentStatus: "completed" }) })).toEqual({
      eligible: false,
      reason: "already_paid",
    });
  });

  it("rejects orders with a completed payment row even if the order looks unpaid", () => {
    expect(
      assessPaymentRetryEligibility({ order: order({ paymentStatus: "failed" }), payment: payment("completed") })
    ).toEqual({ eligible: false, reason: "already_paid" });
  });

  it("rejects orders with a charge in progress and missing orders", () => {
    expect(assessPaymentRetryEligibility({ order: order({ status: "processing" }) })).toEqual({
      eligible: false,
      reason: "payment_in_progress",
    });
    expect(assessPaymentRetryEligibility({ order: null })).toEqual({ eligible: false, reason: "order_not_found" });
  });
});
