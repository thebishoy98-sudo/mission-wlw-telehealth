import type { Order, ReorderReviewStatus } from "@/types";

/**
 * Back-to-back reorder review gate.
 *
 * A too-soon reorder is flagged (not blocked) for admin review; dispatch is held
 * until an admin approves it. This is the dispatch-side gate + review-update
 * builder. The decision of WHEN to flag lives in lib/order-cadence.ts.
 */

export const REORDER_REVIEW_PASS_STATUSES: ReorderReviewStatus[] = ["approved"];

export function getReorderReviewGate(order: Pick<Order, "reorderReviewStatus">) {
  const status = order.reorderReviewStatus;
  const canDispatch = !status || REORDER_REVIEW_PASS_STATUSES.includes(status);
  return {
    canDispatch,
    blockedReason: canDispatch ? undefined : "reorder_too_soon",
  };
}

export type ReorderReviewAction = "approve" | "reject";

export function getReorderReviewUpdate({
  action,
  reviewedBy,
  notes,
  now = new Date().toISOString(),
}: {
  action: ReorderReviewAction;
  reviewedBy: string;
  notes?: string;
  now?: string;
}): Partial<Order> {
  const approved = action === "approve";
  return {
    reorderReviewStatus: approved ? "approved" : "rejected",
    reorderReviewReason:
      notes || (approved ? "Early reorder approved by admin." : "Early reorder rejected by admin."),
    reorderReviewedAt: now,
    reorderReviewedBy: reviewedBy,
  };
}
