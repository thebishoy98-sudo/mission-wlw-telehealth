export function parseChargeOverride(overrideValue: unknown): number | null {
  const overrideAmount = Number(overrideValue);
  return Number.isFinite(overrideAmount) && overrideAmount > 0
    ? Number(overrideAmount.toFixed(2))
    : null;
}

export function resolveChargeAmount(submittedAmount: unknown, overrideValue = process.env.PAYMENT_CHARGE_AMOUNT_OVERRIDE): number {
  const overrideAmount = parseChargeOverride(overrideValue);
  if (overrideAmount !== null) return overrideAmount;
  return Number(submittedAmount);
}

export function getChargeAmount(submittedAmount: unknown, overrideValue = process.env.PAYMENT_CHARGE_AMOUNT_OVERRIDE) {
  const chargeAmount = resolveChargeAmount(submittedAmount, overrideValue);

  return Number.isFinite(chargeAmount) && chargeAmount > 0
    ? Number(chargeAmount.toFixed(2))
    : null;
}
