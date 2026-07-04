import { calculateSupplementalCharge } from "@/lib/subscription-adjustment";

describe("calculateSupplementalCharge", () => {
  it("charges the positive difference between the new dose and completed refill", () => {
    expect(calculateSupplementalCharge({
      previousCharge: 299,
      newDosePrice: 399,
    })).toEqual({ amount: 100, calculatedDifference: 100 });
  });

  it("rounds currency differences to cents", () => {
    expect(calculateSupplementalCharge({
      previousCharge: 299.995,
      newDosePrice: 400,
    }).amount).toBe(100.01);
  });

  it("rejects dose changes that do not produce a positive difference", () => {
    expect(() => calculateSupplementalCharge({
      previousCharge: 399,
      newDosePrice: 299,
    })).toThrow("higher than the amount already charged");
  });

  it("requires a reason when staff overrides the calculated amount", () => {
    expect(() => calculateSupplementalCharge({
      previousCharge: 299,
      newDosePrice: 399,
      overrideAmount: 75,
    })).toThrow("reason is required");
  });

  it("accepts a positive override with a reason", () => {
    expect(calculateSupplementalCharge({
      previousCharge: 299,
      newDosePrice: 399,
      overrideAmount: 75,
      overrideReason: "Partial supplemental shipment",
    })).toEqual({ amount: 75, calculatedDifference: 100 });
  });
});
