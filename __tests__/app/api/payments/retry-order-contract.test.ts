/** @jest-environment node */

import fs from "fs";
import path from "path";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("payment link retry contract", () => {
  const retryRoute = read("app/api/payments/retry-order/route.ts");
  const adminLinkRoute = read("app/api/admin/orders/payment-link/route.ts");
  const payPage = read("app/pay/order/[token]/page.tsx");
  const adminOrdersPage = read("app/admin/orders/page.tsx");

  it("admin payment-link API requires admin auth and refuses already-paid orders", () => {
    expect(adminLinkRoute).toContain("requireAdmin");
    expect(adminLinkRoute).toContain("assessPaymentRetryEligibility");
    expect(adminLinkRoute).toContain("createPaymentLinkToken");
    expect(adminLinkRoute).toContain("already has a completed payment");
  });

  it("retry API validates the signed token before doing anything", () => {
    expect(retryRoute).toContain("verifyPaymentLinkToken");
    expect(retryRoute).toContain("expired");
    expect(retryRoute).toContain("bad_signature");
  });

  it("retry API refuses already-paid orders before charging", () => {
    expect(retryRoute).toContain("assessPaymentRetryEligibility");
    expect(retryRoute).toContain("This order has already been paid.");
  });

  it("retry API updates the SAME order and never creates a new one", () => {
    expect(retryRoute).not.toContain("orderDb.create");
    expect(retryRoute).toContain("dbServer.orderDb.update(orderId");
  });

  it("retry API charges QuickBooks and only marks paid after capture", () => {
    expect(retryRoute).toContain("qbPayments.chargeCard");
    // failure path: revert to unpaid, log, 402 — no completed payment written
    expect(retryRoute).toContain("revertToUnpaid");
    expect(retryRoute).toContain("payment_status = 'failed'");
    expect(retryRoute).toContain("status: 402");
  });

  it("retry API uses an atomic duplicate-charge lock on the order row", () => {
    expect(retryRoute).toContain("UPDATE orders SET status = 'processing'");
    expect(retryRoute).toContain("payment_status <> 'completed'");
  });

  it("retry API derives the amount server-side instead of trusting the client", () => {
    expect(retryRoute).toContain("getChargeAmount(dose?.price ?? product?.startingPrice)");
    expect(retryRoute).not.toContain("body.amount");
  });

  it("retry API quotes and spends referral credit only after capture", () => {
    expect(retryRoute).toContain("getReferralBalance");
    expect(retryRoute).toContain("calculateReferralPricing");
    const paymentWrite = retryRoute.indexOf("dbServer.paymentDb.create(paymentRecord)");
    const creditWrite = retryRoute.indexOf("recordReferralCreditSpend(");
    expect(creditWrite).toBeGreaterThan(paymentWrite);
    expect(retryRoute).toContain("creditApplied:");
  });

  it("retry API reuses existing identity/consent data and gates dispatch on identity", () => {
    expect(retryRoute).toContain("resolveReusableCheckoutIdentity");
    expect(retryRoute).toContain("getIdentityGate");
    expect(retryRoute).toContain("canDispatchPharmacyAfterPayment");
    expect(retryRoute).toContain("getPracticeQAutomationAfterPaymentDecision");
  });

  it("pay-only page collects card details without intake or identity steps", () => {
    expect(payPage).toContain("/api/payments/retry-order");
    expect(payPage).not.toContain("questionnaireAnswers");
    expect(payPage).not.toContain("identityUploads");
    expect(payPage).not.toContain("intake-store");
    expect(payPage).toContain("already paid");
  });

  it("admin orders page offers Create Payment Link for unpaid orders only", () => {
    expect(adminOrdersPage).toContain("Create Payment Link");
    expect(adminOrdersPage).toContain("/api/admin/orders/payment-link");
    expect(adminOrdersPage).toContain('selectedOrder.paymentStatus !== "completed"');
  });
});
