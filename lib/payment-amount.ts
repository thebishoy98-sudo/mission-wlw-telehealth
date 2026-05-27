export function parseChargeOverride(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

export function resolveChargeAmount(requestedAmount: number, overrideValue?: string) {
  const override = parseChargeOverride(overrideValue);
  if (override) return override;
  return requestedAmount;
}
