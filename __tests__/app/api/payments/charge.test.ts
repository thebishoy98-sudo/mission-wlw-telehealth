/** @jest-environment node */

import { getChargeAmount } from "@/lib/payment-amount";

describe("payment charge amount contract", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it("charges the configured test override instead of the product price", () => {
    process.env = {
      ...originalEnv,
      PAYMENT_CHARGE_AMOUNT_OVERRIDE: "0.01",
    };

    expect(getChargeAmount(299.99)).toBe(0.01);
  });

  it("falls back to the submitted amount when no override is configured", () => {
    process.env = {
      ...originalEnv,
      PAYMENT_CHARGE_AMOUNT_OVERRIDE: "",
    };

    expect(getChargeAmount("299.99")).toBe(299.99);
  });

  it("rejects missing or invalid charge amounts", () => {
    process.env = {
      ...originalEnv,
      PAYMENT_CHARGE_AMOUNT_OVERRIDE: "",
    };

    expect(getChargeAmount(undefined)).toBeNull();
    expect(getChargeAmount("not-a-number")).toBeNull();
    expect(getChargeAmount(0)).toBeNull();
  });
});
