import type { Order } from "@/types";
import { getIdentityGate } from "@/lib/identity";
import { getPriorMedGate } from "@/lib/prior-med";
import { getReorderReviewGate } from "@/lib/reorder-review";

/**
 * Combined pharmacy-dispatch gate. An order may only be dispatched to the
 * pharmacy once ALL clinical gates pass: identity verification, prior-GLP-1
 * proof, and back-to-back reorder review. Use this at every dispatch decision
 * point so approving one gate never bypasses another.
 */
export function getOrderDispatchGate(
  order: Pick<Order, "identityStatus" | "priorMedStatus" | "reorderReviewStatus">
) {
  const identity = getIdentityGate(order);
  const priorMed = getPriorMedGate(order);
  const reorder = getReorderReviewGate(order);
  const canDispatch = identity.canDispatch && priorMed.canDispatch && reorder.canDispatch;
  return {
    canDispatch,
    identity,
    priorMed,
    reorder,
    blockedReason: !identity.canDispatch
      ? identity.blockedReason
      : !priorMed.canDispatch
        ? priorMed.blockedReason
        : !reorder.canDispatch
          ? reorder.blockedReason
          : undefined,
  };
}
