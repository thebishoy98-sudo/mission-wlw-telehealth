import type { DoseOption, Order, Product } from "@/types";

export function practiceQReadyForPharmacy(order: Pick<Order, "practiceQStatus">): boolean {
  return order.practiceQStatus === "submitted" || order.practiceQStatus === "completed";
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function doseMatchesHint(dose: DoseOption, hint: string): boolean {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) return false;

  const values = [
    dose.id,
    dose.label,
    dose.strength,
    dose.patientDescription,
    dose.prescriptionLabel,
    `${dose.weeklyDoseMg}mg`,
    `${dose.weeklyDoseMg} mg`,
  ]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeText);

  return values.some((value) => value && (normalizedHint.includes(value) || value.includes(normalizedHint)));
}

export function normalizeOrderForPharmacyDispatch(
  order: Order,
  product: Product | null | undefined,
  doseHints: string[] = []
): { normalizedOrder: Order | null; repaired: boolean; reason?: string } {
  if (!product) return { normalizedOrder: null, repaired: false, reason: "missing product" };

  const exact = product.doses.find((dose) => dose.id === order.doseId);
  if (exact) return { normalizedOrder: order, repaired: false };

  const hintedDose = doseHints
    .filter((hint): hint is string => typeof hint === "string" && hint.trim().length > 0)
    .map((hint) => product.doses.find((dose) => doseMatchesHint(dose, hint)))
    .find((dose): dose is DoseOption => Boolean(dose));

  if (hintedDose) {
    return { normalizedOrder: { ...order, doseId: hintedDose.id }, repaired: true };
  }

  if (product.doses.length === 1) {
    return { normalizedOrder: { ...order, doseId: product.doses[0].id }, repaired: true };
  }

  return { normalizedOrder: null, repaired: false, reason: "missing dose" };
}
