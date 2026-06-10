import { getOrderStatusLabel } from "@/lib/utils";
import type { Order } from "@/types";

const order = {
  status: "cancelled",
  paymentStatus: "failed",
} as Order;

describe("order status labels", () => {
  it("shows payment declined for cancelled orders with failed payment", () => {
    expect(getOrderStatusLabel(order)).toBe("Payment Declined");
  });

  it("keeps cancelled label for non-payment cancellations", () => {
    expect(getOrderStatusLabel({ ...order, paymentStatus: "refunded" })).toBe("Cancelled");
  });
});
