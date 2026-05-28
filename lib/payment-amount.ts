export function getChargeAmount(submittedAmount: unknown, overrideValue = process.env.PAYMENT_CHARGE_AMOUNT_OVERRIDE) {
  const requestedAmount = Number(submittedAmount);
  const overrideAmount = Number(overrideValue);
  const chargeAmount =
    Number.isFinite(overrideAmount) && overrideAmount > 0
      ? overrideAmount
      : requestedAmount;

  return Number.isFinite(chargeAmount) && chargeAmount > 0
    ? Number(chargeAmount.toFixed(2))
    : null;
}
