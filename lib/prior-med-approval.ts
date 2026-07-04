import type { Order, ProviderReview } from "@/types";
import { getOrderDispatchGate } from "@/lib/order-gates";
import { getPriorMedReviewUpdate } from "@/lib/prior-med";

type PriorMedApprovalInput = {
  reviewedBy: string;
  notes?: string;
  now?: string;
};

export function buildPriorMedApprovalOrderUpdate(
  order: Order,
  { reviewedBy, notes, now = new Date().toISOString() }: PriorMedApprovalInput
): Partial<Order> {
  const priorMedUpdate = getPriorMedReviewUpdate({ action: "approve", reviewedBy, notes, now });
  const merged = { ...order, ...priorMedUpdate };

  // Only advance the order to approved when EVERY dispatch gate now passes.
  if (order.status === "pending_review" && getOrderDispatchGate(merged).canDispatch) {
    return {
      ...priorMedUpdate,
      status: "approved",
      approvedAt: now,
      ...(notes ? { providerNotes: notes } : {}),
    };
  }

  return priorMedUpdate;
}

export function buildPriorMedDenialOrderUpdate(
  _order: Order,
  { reviewedBy, notes, now = new Date().toISOString() }: PriorMedApprovalInput
): Partial<Order> {
  return getPriorMedReviewUpdate({ action: "deny", reviewedBy, notes, now });
}

export function buildPriorMedApprovalReviewUpdate(
  review: ProviderReview,
  { reviewedBy, notes, now = new Date().toISOString() }: PriorMedApprovalInput
): Partial<ProviderReview> {
  return {
    reviewedAt: now,
    reviewedBy,
    notes: notes ?? review.notes,
  };
}
