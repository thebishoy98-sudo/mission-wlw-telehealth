type SupplementalChargeInput = {
  previousCharge: number;
  newDosePrice: number;
  overrideAmount?: number;
  overrideReason?: string;
};

const roundCurrency = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateSupplementalCharge({
  previousCharge,
  newDosePrice,
  overrideAmount,
  overrideReason,
}: SupplementalChargeInput): {
  amount: number;
  calculatedDifference: number;
} {
  const calculatedDifference = roundCurrency(newDosePrice - previousCharge);
  if (!Number.isFinite(calculatedDifference) || calculatedDifference <= 0) {
    throw new Error("The new dose price must be higher than the amount already charged.");
  }

  if (overrideAmount !== undefined) {
    const amount = roundCurrency(overrideAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Override amount must be a positive number.");
    }
    if (!overrideReason?.trim()) {
      throw new Error("An override reason is required.");
    }
    return { amount, calculatedDifference };
  }

  return { amount: calculatedDifference, calculatedDifference };
}
