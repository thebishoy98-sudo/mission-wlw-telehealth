import type { Order } from "@/types";

export function isPaidAdminOrder(order: Pick<Order, "paymentStatus">): boolean {
  return order.paymentStatus === "completed";
}
