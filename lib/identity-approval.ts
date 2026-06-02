import type { IdentityAiResult, IdentityStatus, Order, ProviderReview } from "@/types";
import { getIdentityGate, getIdentityReviewUpdate } from "@/lib/identity";

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

export function shouldRetryPracticeQCompletionAfterIdentityApproval(order: Pick<Order, "identityStatus" | "practiceQStatus" | "pharmacyStatus">) {
  return (
    getIdentityGate(order).canDispatch &&
    (order.pharmacyStatus === "draft" || order.pharmacyStatus === "error")
  );
}

export function buildIdentityUploadOrderUpdate(
  order: Order,
  {
    identityStatus,
    result,
    now = new Date().toISOString(),
  }: {
    identityStatus: IdentityStatus;
    result: IdentityAiResult;
    now?: string;
  }
): Partial<Order> {
  const verified = identityStatus === "verified";
  const update: Partial<Order> = {
    identityStatus,
    identityReason: result.summary,
    identityAiResult: result,
    identityReviewedAt: result.checkedAt ?? now,
    identityReviewedBy: verified ? "anthropic-ai" : undefined,
  };

  if (verified && order.status === "pending_review") {
    update.status = "approved";
    update.approvedAt = now;
  }

  return update;
}

export function buildIdentityUploadReviewUpdate(
  review: ProviderReview,
  {
    identityStatus,
    result,
    now = new Date().toISOString(),
  }: {
    identityStatus: IdentityStatus;
    result: IdentityAiResult;
    now?: string;
  }
): Partial<ProviderReview> {
  if (identityStatus === "verified") {
    return {
      status: "approved",
      reviewedAt: now,
      reviewedBy: "anthropic-ai",
      notes: review.notes,
      identityAiResult: result,
      identityReviewRequired: false,
    };
  }

  return {
    status: identityStatus === "rejected" ? "rejected" : "needs_more_info",
    rejectionReason: identityStatus === "rejected" ? result.summary : review.rejectionReason,
    notes: `${review.notes ?? ""}\nIdentity review required: ${result.summary}`.trim(),
    identityAiResult: result,
    identityReviewRequired: true,
  };
}
