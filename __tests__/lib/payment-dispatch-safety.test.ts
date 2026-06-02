import {
  canDispatchPharmacyAfterPayment,
  getPracticeQAutomationAfterPaymentDecision,
  isRealPharmacyEnabled,
} from "@/lib/payment-dispatch-safety";

describe("payment dispatch safety", () => {
  it("holds real pharmacy dispatch when payment was bypassed", () => {
    expect(
      canDispatchPharmacyAfterPayment({
        identityCanDispatch: true,
        paymentBypassed: true,
        realPharmacyEnabled: true,
      })
    ).toBe(false);
  });

  it("allows real pharmacy dispatch after a non-bypassed payment", () => {
    expect(
      canDispatchPharmacyAfterPayment({
        identityCanDispatch: true,
        paymentBypassed: false,
        realPharmacyEnabled: true,
      })
    ).toBe(true);
  });

  it("detects production LifeFile and AppSheet modes from env", () => {
    expect(isRealPharmacyEnabled("lifefile", { USE_REAL_LIFEFILE: "true" })).toBe(true);
    expect(isRealPharmacyEnabled("appsheet", { USE_REAL_APPSHEET: "true" })).toBe(true);
    expect(isRealPharmacyEnabled("lifefile", { USE_REAL_LIFEFILE: "false" })).toBe(false);
  });

  it("does not treat LifeFile sandbox as real paid pharmacy dispatch", () => {
    expect(isRealPharmacyEnabled("lifefile", {
      USE_REAL_LIFEFILE: "true",
      LIFEFILE_ENVIRONMENT: "sandbox",
    })).toBe(false);
    expect(canDispatchPharmacyAfterPayment({
      identityCanDispatch: true,
      paymentBypassed: true,
      realPharmacyEnabled: isRealPharmacyEnabled("lifefile", {
        USE_REAL_LIFEFILE: "true",
        LIFEFILE_ENVIRONMENT: "sandbox",
      }),
    })).toBe(true);
  });

  it("defers PracticeQ automation after payment when identity is still missing", () => {
    expect(
      getPracticeQAutomationAfterPaymentDecision({
        identityCanDispatch: false,
        checkoutIdentityReused: false,
      })
    ).toBe("defer_identity");
  });

  it("queues PracticeQ automation only when identity is ready and skips duplicate reorder charts", () => {
    expect(
      getPracticeQAutomationAfterPaymentDecision({
        identityCanDispatch: true,
        checkoutIdentityReused: false,
      })
    ).toBe("queue");

    expect(
      getPracticeQAutomationAfterPaymentDecision({
        identityCanDispatch: true,
        checkoutIdentityReused: true,
      })
    ).toBe("skip_reorder");
  });
});
