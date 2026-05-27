import { parseChargeOverride, resolveChargeAmount } from "@/lib/payment-amount";

describe("payment amount override", () => {
  it("uses a valid penny override", () => {
    expect(resolveChargeAmount(299, "0.01")).toBe(0.01);
  });

  it("ignores missing or invalid overrides", () => {
    expect(resolveChargeAmount(299, undefined)).toBe(299);
    expect(resolveChargeAmount(299, "0")).toBe(299);
    expect(resolveChargeAmount(299, "not-a-number")).toBe(299);
  });

  it("rounds override values to cents", () => {
    expect(parseChargeOverride("0.019")).toBe(0.02);
  });
});
