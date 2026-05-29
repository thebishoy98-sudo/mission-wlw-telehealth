import type { Order, ProviderReview } from "@/types";
import { getIdentityReviewUpdate } from "@/lib/identity";

type ManualApprovalInput = {
  reviewedBy: string;
  notes?: string;
  now?: string;
};

export function buildManualIdentityApprovalOrderUpdate(
  order: Order,
  { reviewedBy, notes, now = new Date().toISOString() }: ManualApprovalInput
): Partial<Order> {
  const identityUpdate = getIdentityReviewUpdate({
    action: "approve",
    reviewedBy,
    notes,
    now,
  });

  if (order.status !== "pending_review") {
    return identityUpdate;
  }

  return {
    ...identityUpdate,
    status: "approved",
    approvedAt: now,
    ...(notes ? { providerNotes: notes } : {}),
  };
}

export function buildManualIdentityApprovalReviewUpdate(
  review: ProviderReview,
  { reviewedBy, notes, now = new Date().toISOString() }: ManualApprovalInput
): Partial<ProviderReview> {
  return {
    status: "approved",
    reviewedAt: now,
    reviewedBy,
    notes: notes ?? review.notes,
    identityReviewRequired: false,
  };
}

export function shouldRetryPracticeQCompletionAfterIdentityApproval(order: Pick<Order, "practiceQStatus" | "pharmacyStatus">) {
  return (
    (order.pharmacyStatus === "draft" || order.pharmacyStatus === "error")
  );
}
