import { isStatusRegression } from "@/lib/lifefile-webhook";

describe("isStatusRegression (out-of-order webhook guard)", () => {
  it("treats a 'shipped' event on an already-delivered order as a regression", () => {
    // The reported bug: FedEx sync marks delivered, then a late LifeFile
    // 'order.shipped' webhook arrives and must not move the order backward.
    expect(isStatusRegression("delivered", "shipped")).toBe(true);
  });

  it("treats earlier-stage events on a shipped order as regressions", () => {
    expect(isStatusRegression("shipped", "received")).toBe(true);
    expect(isStatusRegression("shipped", "processing")).toBe(true);
  });

  it("allows forward progression", () => {
    expect(isStatusRegression("received", "shipped")).toBe(false);
    expect(isStatusRegression("shipped", "delivered")).toBe(false);
    expect(isStatusRegression("processing", "shipped")).toBe(false);
  });

  it("allows same-status (idempotent) updates", () => {
    expect(isStatusRegression("shipped", "shipped")).toBe(false);
    expect(isStatusRegression("delivered", "delivered")).toBe(false);
  });

  it("does not flag unknown/side states (e.g. error) as regressions", () => {
    expect(isStatusRegression("error", "shipped")).toBe(false);
    expect(isStatusRegression(undefined, "shipped")).toBe(false);
    expect(isStatusRegression(null, "shipped")).toBe(false);
  });
});
