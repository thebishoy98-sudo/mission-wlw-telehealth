import { isPaidAdminOrder } from "@/lib/admin-order-visibility";
import type { PaymentStatus } from "@/types";

const order = (paymentStatus: PaymentStatus) => ({ paymentStatus });

describe("admin order visibility", () => {
  it("shows only completed payments", () => {
    expect(isPaidAdminOrder(order("completed"))).toBe(true);
    expect(isPaidAdminOrder(order("pending"))).toBe(false);
    expect(isPaidAdminOrder(order("failed"))).toBe(false);
    expect(isPaidAdminOrder(order("refunded"))).toBe(false);
  });
});
