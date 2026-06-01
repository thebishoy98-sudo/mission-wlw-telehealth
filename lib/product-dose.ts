import type { DoseOption, Product } from "@/types";
import { formatCurrency } from "@/lib/utils";

function doseDescription(dose: Pick<DoseOption, "patientDescription" | "strength">): string {
  return dose.patientDescription?.trim() || dose.strength || "Prescription";
}

export function formatDoseOptionLabel(dose: Pick<DoseOption, "label" | "patientDescription" | "strength" | "price">): string {
  return `${dose.label} - ${doseDescription(dose)} - ${formatCurrency(dose.price)}`;
}

export function formatDoseOptionSummary(dose: Pick<DoseOption, "label" | "patientDescription" | "strength" | "price">): string {
  return `${dose.label} - ${doseDescription(dose)} at ${formatCurrency(dose.price)}`;
}

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
