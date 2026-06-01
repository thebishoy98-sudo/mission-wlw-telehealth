import { getIdentityGate } from "@/lib/identity";
import type { IdentityStatus, Order, OrderStatus } from "@/types";

const PRIOR_DISPATCHED_STATUSES: OrderStatus[] = [
  "sent_to_pharmacy",
  "processing",
  "fulfilled",
  "shipped",
  "delivered",
];

export type ReusableCheckoutIdentityInput = {
  patientId: string;
  currentOrderId: string;
  isReorder: boolean;
  reorderSourceOrderId?: string;
  patientOrders: Order[];
};

export type ReusableCheckoutIdentityResult =
  | {
      reused: true;
      sourceOrderId: string;
      identityStatus: Extract<IdentityStatus, "verified" | "manual_approved">;
      summary: string;
    }
  | {
      reused: false;
    };

function reusableStatus(status: Order["identityStatus"]): Extract<IdentityStatus, "verified" | "manual_approved"> {
  return getIdentityGate({ identityStatus: status }).canDispatch
    ? (status as Extract<IdentityStatus, "verified" | "manual_approved">)
    : "manual_approved";
}

function isAllowedPriorOrder(order: Order) {
  return (
    getIdentityGate({ identityStatus: order.identityStatus }).canDispatch ||
    PRIOR_DISPATCHED_STATUSES.includes(order.status)
  );
}

function descendingOrderTime(a: Order, b: Order) {
  const bTime = new Date(b.submittedAt ?? b.updatedAt ?? b.createdAt).getTime();
  const aTime = new Date(a.submittedAt ?? a.updatedAt ?? a.createdAt).getTime();
  return bTime - aTime;
}

export function resolveReusableCheckoutIdentity({
  patientId,
  currentOrderId,
  isReorder,
  reorderSourceOrderId = "",
  patientOrders,
}: ReusableCheckoutIdentityInput): ReusableCheckoutIdentityResult {
  const ownedOrders = patientOrders.filter((order) => order.patientId === patientId);

  if (isReorder && reorderSourceOrderId) {
    const sourceOrder = ownedOrders.find((order) => order.id === reorderSourceOrderId);
    if (sourceOrder) {
      return {
        reused: true,
        sourceOrderId: sourceOrder.id,
        identityStatus: reusableStatus(sourceOrder.identityStatus),
        summary: "Reorder identity reused from the patient's previous order.",
      };
    }
  }

  const previousAllowedOrder = ownedOrders
    .filter((order) => order.id !== currentOrderId)
    .filter(isAllowedPriorOrder)
    .sort(descendingOrderTime)[0];

  if (!previousAllowedOrder) return { reused: false };

  return {
    reused: true,
    sourceOrderId: previousAllowedOrder.id,
    identityStatus: reusableStatus(previousAllowedOrder.identityStatus),
    summary: "Returning patient identity reused from the patient's previous verified order.",
  };
}
