import type { Order, PharmacyOrder } from "@/types";

export function getDisplayOrderNumber(order: Pick<Order, "id">, pharmacyOrder?: Pick<PharmacyOrder, "lifeFileOrderId"> | null) {
  const pharmacyOrderNumber = String(pharmacyOrder?.lifeFileOrderId ?? "").trim();
  return pharmacyOrderNumber || order.id.slice(-8);
}

export function isPracticeQSkippedForOrder(order: Pick<Order, "practiceQStatus" | "identityReason">) {
  return (
    order.practiceQStatus === "skipped" ||
    /identity reused from the patient's previous/i.test(String(order.identityReason ?? ""))
  );
}

export function getDisplayPracticeQStatus(order: Pick<Order, "practiceQStatus" | "identityReason">) {
  return isPracticeQSkippedForOrder(order) ? "skipped" : order.practiceQStatus;
}
