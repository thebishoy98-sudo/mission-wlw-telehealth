import type { DoseOption, Product } from "@/types";

export function resolvePersistedDose(
  persistedProduct: Pick<Product, "doses"> | null | undefined,
  submittedProduct: Pick<Product, "doses"> | null | undefined,
  submittedDoseId: string | null | undefined
): DoseOption | null {
  if (!persistedProduct || !submittedDoseId) return null;

  const exact = persistedProduct.doses.find((dose) => dose.id === submittedDoseId);
  if (exact) return exact;

  const submittedDose = submittedProduct?.doses?.find((dose) => dose.id === submittedDoseId);
  if (!submittedDose) return null;

  const semanticMatch = persistedProduct.doses.find(
    (dose) =>
      dose.label === submittedDose.label ||
      dose.strength === submittedDose.strength ||
      dose.weeklyDoseMg === submittedDose.weeklyDoseMg
  );
  if (semanticMatch) return semanticMatch;

  const submittedIndex = submittedProduct?.doses?.findIndex((dose) => dose.id === submittedDoseId) ?? -1;
  return submittedIndex >= 0 ? persistedProduct.doses[submittedIndex] ?? null : null;
}
