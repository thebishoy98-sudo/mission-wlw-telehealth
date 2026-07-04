import type { Order, ProviderReview } from "@/types";
import { getOrderDispatchGate } from "@/lib/order-gates";
import { getReorderReviewUpdate } from "@/lib/reorder-review";

type ReorderReviewInput = {
  reviewedBy: string;
  notes?: string;
  now?: string;
};

export function buildReorderReviewApprovalOrderUpdate(
  order: Order,
  action: "approve" | "reject",
  { reviewedBy, notes, now = new Date().toISOString() }: ReorderReviewInput
): Partial<Order> {
  const reviewUpdate = getReorderReviewUpdate({ action, reviewedBy, notes, now });
  if (action !== "approve") return reviewUpdate;

  const merged = { ...order, ...reviewUpdate };
  // Only advance to approved when every other dispatch gate also passes.
  if (order.status === "pending_review" && getOrderDispatchGate(merged).canDispatch) {
    return {
      ...reviewUpdate,
      status: "approved",
      approvedAt: now,
      ...(notes ? { providerNotes: notes } : {}),
    };
  }
  return reviewUpdate;
}

export function buildReorderReviewApprovalReviewUpdate(
  review: ProviderReview,
  { reviewedBy, notes, now = new Date().toISOString() }: ReorderReviewInput
): Partial<ProviderReview> {
  return {
    reviewedAt: now,
    reviewedBy,
    notes: notes ?? review.notes,
  };
}
