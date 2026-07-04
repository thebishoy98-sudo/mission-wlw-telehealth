import crypto from "crypto";
import type { Order, PriorMedStatus, Product } from "@/types";

/**
 * Prior-GLP-1 proof gate.
 *
 * A patient may only start at the lowest (starting) dose of a product unless
 * they document that they have taken GLP-1 before. When a higher dose is
 * ordered by a new patient we hold pharmacy dispatch, text them to upload their
 * existing script, and require an admin to approve it.
 */

export const PRIOR_MED_PASS_STATUSES: PriorMedStatus[] = ["not_required", "approved"];

/**
 * The starting dose is the lowest weekly dose offered for a product. Products
 * list doses ascending, so we prefer the lowest `weeklyDoseMg` and fall back to
 * the first listed dose when weekly dosing metadata is absent.
 */
export function getStartingDoseId(
  product: Pick<Product, "doses"> | null | undefined
): string | undefined {
  const doses = product?.doses ?? [];
  if (!doses.length) return undefined;
  const withWeekly = doses.filter((dose) => typeof dose.weeklyDoseMg === "number");
  if (withWeekly.length) {
    return withWeekly.reduce((min, dose) => (dose.weeklyDoseMg! < min.weeklyDoseMg! ? dose : min)).id;
  }
  return doses[0].id;
}

export function isStartingDose(
  product: Pick<Product, "doses"> | null | undefined,
  doseId: string | null | undefined
): boolean {
  const startingDoseId = getStartingDoseId(product);
  // Fail open: with no product/dose context we cannot tell, so do not gate.
  if (!startingDoseId || !doseId) return true;
  return doseId === startingDoseId;
}

/**
 * An "established" patient has a prior order that reached the pharmacy (i.e. we
 * already vetted them for GLP-1). Such patients are exempt from the proof gate.
 */
export function patientHasEstablishedHistory(
  orders: Array<Pick<Order, "id" | "status" | "pharmacyStatus">>,
  excludeOrderId?: string
): boolean {
  const dispatchedStatuses: Order["status"][] = ["sent_to_pharmacy", "processing", "shipped", "delivered"];
  const dispatchedPharmacyStatuses: Order["pharmacyStatus"][] = ["submitted", "received", "processing", "fulfilled", "shipped", "delivered"];
  return orders.some((order) => {
    if (order.id === excludeOrderId) return false;
    return dispatchedStatuses.includes(order.status) || dispatchedPharmacyStatuses.includes(order.pharmacyStatus);
  });
}

export function requiresPriorMedProof(params: {
  product: Pick<Product, "doses"> | null | undefined;
  doseId: string | null | undefined;
  isRefill?: boolean;
  hasEstablishedHistory?: boolean;
}): boolean {
  if (params.isRefill) return false;
  if (params.hasEstablishedHistory) return false;
  return !isStartingDose(params.product, params.doseId);
}

export function getPriorMedGate(order: Pick<Order, "priorMedStatus">) {
  const status = order.priorMedStatus;
  const canDispatch = !status || PRIOR_MED_PASS_STATUSES.includes(status);
  return {
    canDispatch,
    blockedReason: canDispatch ? undefined : "prior_glp1_proof_required",
  };
}

export function createPriorMedUploadToken(orderId: string) {
  return `rx_${orderId}_${crypto.randomBytes(18).toString("base64url")}`;
}

export function buildPriorMedUploadUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/upload-prescription/${encodeURIComponent(token)}`;
}

export type PriorMedReviewAction = "approve" | "deny";

export function getPriorMedReviewUpdate({
  action,
  reviewedBy,
  notes,
  now = new Date().toISOString(),
}: {
  action: PriorMedReviewAction;
  reviewedBy: string;
  notes?: string;
  now?: string;
}): Partial<Order> {
  const approved = action === "approve";
  return {
    priorMedStatus: approved ? "approved" : "rejected",
    priorMedReason:
      notes || (approved ? "Prior GLP-1 proof approved." : "Prior GLP-1 proof rejected."),
    priorMedReviewedAt: now,
    priorMedReviewedBy: reviewedBy,
  };
}
