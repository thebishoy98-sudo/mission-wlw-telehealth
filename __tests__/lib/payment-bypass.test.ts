/** @jest-environment node */

import { shouldBypassQuickBooksPayment } from "@/lib/payment-bypass";

describe("QuickBooks payment bypass", () => {
  it("bypasses when explicitly enabled", () => {
    expect(shouldBypassQuickBooksPayment({
      BYPASS_QB_PAYMENTS: "true",
      NEXT_PUBLIC_QB_PAYMENTS_ENABLED: "true",
    })).toBe(true);
  });

  it("does not bypass when explicitly disabled", () => {
    expect(shouldBypassQuickBooksPayment({
      BYPASS_QB_PAYMENTS: "false",
      NEXT_PUBLIC_QB_PAYMENTS_ENABLED: "false",
    })).toBe(false);
  });

  it("defaults to bypass when the tokenized QuickBooks checkout is not enabled", () => {
    expect(shouldBypassQuickBooksPayment({
      BYPASS_QB_PAYMENTS: undefined,
      NEXT_PUBLIC_QB_PAYMENTS_ENABLED: undefined,
    })).toBe(true);
    expect(shouldBypassQuickBooksPayment({
      BYPASS_QB_PAYMENTS: undefined,
      NEXT_PUBLIC_QB_PAYMENTS_ENABLED: "false",
    })).toBe(true);
  });
});
